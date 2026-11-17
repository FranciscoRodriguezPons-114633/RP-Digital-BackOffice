# Operación: el entorno de prueba en la nube

Guía para levantar y mantener el entorno de prueba (N1): Supabase en São Paulo, la app en Vercel, despliegue desde GitHub Actions, copias diarias y registro de errores en Sentry. Es privado y por invitación: **no es el lanzamiento**. Para producción se repiten los mismos pasos con otro proyecto y un dominio propio.

Lo que va en la nube y no en el repositorio: URLs, claves y secretos. Nada de eso va en migraciones ni en archivos commiteados.

## Cómo queda armado

| Pieza | Dónde | Quién la actualiza |
| --- | --- | --- |
| Base, Auth y Storage | Supabase, región São Paulo (`sa-east-1`) | El CI aplica las migraciones en cada push a `main` con todo en verde |
| Función de correos (`process-outbox`) | Supabase Edge Functions | El CI, en el mismo paso |
| App | Vercel, funciones en São Paulo (`gru1`, en `vercel.json`) | El CI dispara un deploy hook **después** de las migraciones. Vercel no despliega solo con cada push (`git.deploymentEnabled: false`) ni arma previews de los PR |
| Copias de la base | Artefactos cifrados de GitHub Actions, 30 días | `copia-de-seguridad.yml`, todos los días a las 3 de Córdoba |
| Errores del servidor | Sentry | `src/instrumentation.ts`, si `SENTRY_DSN` está cargado |
| Límites de pedidos en `/login` y `/aprobar` | La base (`public.hit_rate_limit`) | Migración `20261120000000` |

## Orden de los pasos

Cada paso dice si lo hacés vos (con tu cuenta) o si ya está en el repositorio.

1. [Cuentas](#1-cuentas) — vos.
2. [Proyecto de Supabase](#2-proyecto-de-supabase) — vos.
3. [Secretos de GitHub y primer despliegue de la base](#3-secretos-de-github-y-primer-despliegue-de-la-base) — vos cargás los secretos; el CI hace el resto.
4. [Autenticación y correos](#4-autenticación-y-correos) — vos, en el panel de Supabase y en Resend.
5. [SQL de una sola vez](#5-sql-de-una-sola-vez) — vos, en el SQL Editor.
6. [Vercel](#6-vercel) — vos.
7. [Sentry](#7-sentry) — vos.
8. [Probar que todo anda](#8-probar-que-todo-anda) — vos, con la lista de control.

---

## 1. Cuentas

| Servicio | Plan para la prueba | Para tener en cuenta |
| --- | --- | --- |
| [Supabase](https://supabase.com) | Free alcanza para empezar | Un proyecto Free se **pausa después de una semana sin uso** y no tiene copias propias (las copias las hace el CI). Cuando haya socios usándolo, conviene Pro (USD 25 por mes) [F] |
| [Vercel](https://vercel.com) | Hobby alcanza para probar | Hobby es para uso no comercial. Para cobrar hace falta Pro [F] |
| [Sentry](https://sentry.io) | Developer (gratis) | 5.000 errores por mes alcanzan de sobra |
| [Resend](https://resend.com) | Free | Hace falta un dominio verificado para mandar correos a cualquiera |
| GitHub | El que ya tenés | Los secretos van en el entorno `prueba` del repositorio |

## 2. Proyecto de Supabase

1. Crear el proyecto en supabase.com, región **South America (São Paulo)**. Guardar la contraseña de la base en tu gestor de contraseñas: la vas a necesitar en el paso 3.
2. Anotar el **Project ref** (Project Settings → General) y la **URL** y la **publishable key** (Project Settings → API Keys).
3. En **Project Settings → Database → Connection string**, copiar la del **Session pooler** (funciona por IPv4, que es lo que tienen los servidores de GitHub). Se ve así:

   ```text
   postgresql://postgres.<ref>:<contraseña>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

   Si la contraseña tiene caracteres especiales, tienen que ir codificados (`@` → `%40`, `#` → `%23`).
4. Activar **Integrations → Cron** y **pg_net** (Database → Extensions → `pg_net`).
5. En **Storage → Settings**, revisar que el límite global de subida sea de al menos 50 MB. El bucket `documents` lo crea la migración.

## 3. Secretos de GitHub y primer despliegue de la base

En el repositorio: **Settings → Environments → New environment** → `prueba`, y adentro **Add environment secret** por cada uno:

| Secreto | De dónde sale | Lo usa |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → Generate new token | Despliegue |
| `SUPABASE_PROJECT_REF` | El Project ref del paso 2 | Despliegue |
| `SUPABASE_DB_PASSWORD` | La contraseña de la base del paso 2 | Despliegue |
| `SUPABASE_DB_URL` | La connection string del Session pooler del paso 2 | Copias |
| `BACKUP_PASSPHRASE` | Una frase larga que inventás y guardás en tu gestor de contraseñas: **sin ella no se puede abrir ninguna copia** | Copias |
| `VERCEL_DEPLOY_HOOK` | El deploy hook del paso 6 (se carga después) | Despliegue |

Con los tres primeros cargados, el próximo push a `main` aplica todas las migraciones y despliega la función de correos (job «Despliegue al entorno de prueba» del CI). Para no esperar un push, se puede volver a correr el último CI de `main` desde **Actions → CI → Re-run all jobs**.

Mientras falten secretos, el job termina en verde con el aviso «Faltan los secretos del entorno de prueba» y no despliega nada.

## 4. Autenticación y correos

### 4.1 URLs del enlace mágico

En **Authentication → URL Configuration**:

- **Site URL**: la URL de Vercel del paso 6 (por ejemplo `https://rp-backoffice.vercel.app`).
- **Redirect URLs**: agregar `https://rp-backoffice.vercel.app/auth/callback`.

En **Authentication → Email Templates → Magic Link**, cambiar el enlace para que funcione aunque el correo se abra en otro dispositivo (típico de un cliente con el celular):

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Ingresar</a>
```

`/auth/callback` acepta las dos variantes (`?code=` y `?token_hash=`).

### 4.2 SMTP propio con Resend

El SMTP que trae Supabase **solo manda correos a los miembros de tu equipo de Supabase**: un socio no recibiría el enlace. Hay que usar Resend:

1. En Resend, verificar el dominio de envío y crear una API key.
2. En **Authentication → Emails → SMTP Settings**: host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña la API key, remitente un correo del dominio verificado.
3. En **Authentication → Rate Limits**, dejar el envío de correos en un valor razonable (por ejemplo 30 por hora). Es la barrera que vale aunque alguien llame a la API de Auth sin pasar por la app.

### 4.3 Función de correos de la app (outbox → Resend)

Las invitaciones y avisos no salen de la app: la base los deja en la tabla `outbox` y la Edge Function `process-outbox` los manda. Si Resend falla, reintenta con espera creciente (1, 4, 9, 16 min) y después de 5 intentos el correo queda en `failed`.

La función la despliega el CI. Sus secretos se cargan una vez desde tu máquina:

```bash
cp supabase/functions/.env.example supabase/functions/.env   # completar
npx supabase login
npx supabase secrets set --env-file supabase/functions/.env --project-ref <ref>
```

## 5. SQL de una sola vez

En el **SQL Editor** del proyecto.

### 5.1 Cron: correos cada minuto y avisos de vencimientos

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<el mismo OUTBOX_CRON_SECRET de supabase/functions/.env>', 'outbox_cron_secret');

select cron.schedule(
  'process-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/process-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'outbox_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Una vez por día, a las 8 de Córdoba (11 UTC).
select cron.schedule('deadline-alerts', '0 11 * * *', $$ select public.process_deadline_alerts() $$);
```

### 5.2 Secreto de los límites de pedidos

Los límites de `/login` y `/aprobar` cuentan por IP y por correo. Como la clave la manda quien llama, en la nube la base exige un secreto que solo conoce el servidor de la app; si no, cualquiera con la publishable key podría agotar el cupo de otra persona.

1. Generar el secreto en tu máquina: `openssl rand -hex 32`.
2. Cargarlo en Vercel como `RATE_LIMIT_SECRET` (paso 6).
3. Guardar su hash en la base (el secreto en sí nunca entra a la base):

```sql
insert into private.settings (name, value)
values ('rate_limit_secret_sha256', encode(sha256(convert_to('<el secreto>', 'UTF8')), 'hex'))
on conflict (name) do update set value = excluded.value;
```

Si la base pide el secreto y la app no lo manda, la app deja pasar el pedido y registra el problema en Sentry: un límite mal configurado nunca deja a nadie afuera.

| Pedido | Cupo |
| --- | --- |
| Enlace mágico, por IP | 10 cada 15 minutos |
| Enlace mágico, por correo | 5 por hora |
| Abrir un link de aprobación, por IP | 60 cada 10 minutos |
| Aprobar o rechazar, por IP | 10 cada 10 minutos |

### 5.3 Administrador de la plataforma

Después de que entres a la app por primera vez:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = '<tu correo>';
```

Con eso ves `/admin/series` (cargar CAC, ICC Córdoba y UOCRA reales) y `/admin/cobros`.

### 5.4 Finanzas de obra para un socio

Hasta el sprint 17, Finanzas de obra se prende a mano, después de que el socio creó su organización:

```sql
update public.organizations set beta_features = '{works}' where name = '<nombre del estudio>';
```

## 6. Vercel

1. **Add New → Project** → importar el repositorio de GitHub. Framework: Next.js (lo detecta solo).
2. **Environment Variables** (para Production):

   | Variable | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | La URL del proyecto de Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La publishable key |
   | `APP_URL` | La URL de producción de Vercel, sin barra al final |
   | `RATE_LIMIT_SECRET` | El secreto del paso 5.2 |
   | `SENTRY_DSN` | El DSN del paso 7 |

3. El primer despliegue lo hace Vercel al importar. Después, `vercel.json` apaga los despliegues automáticos (`git.deploymentEnabled: false`): la app se actualiza solo cuando el CI terminó las migraciones.
4. **Settings → Git → Deploy Hooks**: crear uno para la rama `main` (nombre: `ci`) y cargar la URL como secreto `VERCEL_DEPLOY_HOOK` en GitHub (paso 3). Esa URL deja desplegar a cualquiera que la tenga: tratala como una contraseña.
5. La app no usa la service role key de Supabase: no hay que cargarla en Vercel.

**A confirmar en el primer push:** que el deploy hook construya `main` con los despliegues automáticos apagados. Según la documentación de Vercel, `git.deploymentEnabled` solo corta los despliegues por push. Si el hook no despliega, se borra esa línea de `vercel.json` y Vercel vuelve a desplegar con cada push (sin el orden migraciones → app).

## 7. Sentry

1. Crear un proyecto de tipo **Next.js** (o Node.js) y copiar el **DSN** (Settings → Client Keys).
2. Cargarlo en Vercel como `SENTRY_DSN` y volver a desplegar.

Qué se registra: cada error del servidor (páginas, acciones, rutas y proxy) con la ruta, el tipo de pedido, el entorno y el commit. No se mandan encabezados, cookies, IP ni la query, y el token de los links de aprobación se tapa. Los errores del navegador todavía no se registran: llegan con las páginas de error propias del sprint 14.

## 8. Probar que todo anda

- [ ] El job «Despliegue al entorno de prueba» del último CI de `main` aplicó las migraciones y desplegó la función.
- [ ] La URL de Vercel abre la página de producto y `/login` manda el enlace a un correo que no es del equipo de Supabase.
- [ ] El enlace abierto en el celular entra a la app.
- [ ] Una invitación a un invitado llega en menos de dos minutos (cron + outbox).
- [ ] **Actions → Copia de seguridad → Run workflow** termina en verde: copió, restauró en un Postgres vacío con los mismos conteos y guardó la copia cifrada.
- [ ] Un error forzado aparece en Sentry (por ejemplo, abrir `/proyectos/<id inexistente>/presupuestos/<otro>` no alcanza, porque es un 404: sirve cualquier error 500 real).
- [ ] Pedir el enlace mágico 6 veces seguidas con el mismo correo muestra «Hiciste muchos pedidos seguidos».

---

## Copias de seguridad

`copia-de-seguridad.yml` corre todos los días a las 3 de Córdoba y también a mano (**Actions → Copia de seguridad → Run workflow**). Cada corrida:

1. Copia roles, esquema y datos (`scripts/db/backup.sh`) y cuenta las filas de las tablas principales (`scripts/db/conteos.sql`).
2. **Prueba la restauración**: levanta un Postgres de Supabase vacío, carga la copia y compara los conteos (`scripts/db/restore-check.sh`). Si no coinciden, la corrida falla y GitHub te avisa por correo.
3. Cifra la copia con `BACKUP_PASSPHRASE` y la guarda 30 días como artefacto de la corrida.

**Lo que no cubre:** los archivos de Storage (planos, renders). Se copian sus metadatos, no los archivos. Con el plan Pro de Supabase, la copia diaria del proyecto sí los incluye.

### Restaurar una copia

1. Bajar el artefacto de la corrida (**Actions → Copia de seguridad → la corrida → Artifacts**) y descomprimir el zip.
2. Descifrar y abrir:

   ```bash
   gpg --decrypt copia-AAAA-MM-DD.tar.gz.gpg | tar -xzf -
   ```

3. Probarla en local antes de tocar nada (necesita Docker y la CLI de Supabase):

   ```bash
   scripts/db/restore-check.sh copia
   ```

4. Para restaurarla en un proyecto nuevo de Supabase (nunca sobre el que está andando):

   ```bash
   grep -v 'ON PARAMETER' copia/roles.sql > copia/roles-restaurar.sql
   psql "<connection string del proyecto nuevo>" --single-transaction -v ON_ERROR_STOP=1 \
     -f copia/roles-restaurar.sql -f copia/schema.sql \
     -c 'SET session_replication_role = replica' -f copia/data.sql
   ```

   Después se repiten los pasos 4 a 6 con el proyecto nuevo y se cambian los secretos de GitHub y las variables de Vercel.

## Controles

```sql
-- Correos trabados o fallidos
select id, kind, to_email, status, attempts, last_error, next_try_at
from public.outbox where status <> 'sent' order by id desc limit 50;

-- Reenviar un correo fallido
update public.outbox set status = 'pending', attempts = 0, next_try_at = now() where id = <id>;

-- Últimas ejecuciones del cron
select * from cron.job_run_details order by start_time desc limit 20;

-- Pedidos frenados por los límites en la última hora
select bucket, count(*) filter (where hits > 5) as claves_cerca_del_limite, max(hits) as maximo
from private.rate_limits where window_start > now() - interval '1 hour' group by bucket;
```

## Cobros (pase a pago)

Quien administra la plataforma confirma los pagos en `/admin/cobros` (ver 5.3). Le llega un correo por cada pedido de pase a pago con los datos de facturación; al confirmar el pago, el estudio queda en su plan y recibe un aviso.
