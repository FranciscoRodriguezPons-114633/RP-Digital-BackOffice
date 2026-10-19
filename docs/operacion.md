# Operación: puesta en marcha de Supabase y correos

Pasos que se hacen una sola vez por entorno (staging y producción). Nada de esto va en migraciones porque depende de URLs y secretos de cada proyecto.

## 1. Proyecto de Supabase

1. Crear el proyecto en supabase.com (región São Paulo, la más cercana a Córdoba).
2. Vincular y aplicar migraciones:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

3. En **Project Settings → API Keys** copiar la *publishable key* a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en Vercel.

## 2. Autenticación (enlace mágico)

En **Authentication → URL Configuration**:

- **Site URL**: la URL de la app (ej. `https://app.tudominio.com`).
- **Redirect URLs**: agregar `https://app.tudominio.com/auth/callback` (y la de staging).

En **Authentication → Email Templates → Magic Link**, cambiar el enlace para que funcione aunque el cliente abra el correo en otro dispositivo (el celular, típico de un cliente):

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Ingresar</a>
```

`/auth/callback` acepta las dos variantes (`?code=` y `?token_hash=`). Con la plantilla por defecto el enlace solo funciona en el mismo navegador donde se pidió.

Límites de Supabase a tener en cuenta: el enlace vence a la hora y se puede pedir uno por minuto por correo. Para producción, configurar un SMTP propio (**Authentication → Emails → SMTP**) con Resend: el SMTP incluido de Supabase tiene un cupo muy bajo y es solo para pruebas.

## 3. Correos de la app (outbox → Resend)

Las invitaciones no se mandan desde la app: la base las deja en la tabla `outbox` en la misma transacción que la invitación, y la Edge Function `process-outbox` las envía. Si Resend falla, el correo se reintenta con espera creciente (1, 4, 9, 16 min) y después de 5 intentos queda en `failed`.

1. Verificar el dominio de envío en Resend y crear una API key.
2. Cargar los secretos y desplegar la función:

   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # completar
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy process-outbox
   ```

3. Activar **Integrations → Cron** y **pg_net** en el panel, y programar la función cada minuto desde el SQL Editor:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<el mismo OUTBOX_CRON_SECRET>', 'outbox_cron_secret');

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
   ```

### Avisos de vencimientos

Una vez por día, a las 8 de Córdoba (11 UTC), `process_deadline_alerts()` encola los avisos de vencimientos; después los manda el mismo outbox:

```sql
select cron.schedule('deadline-alerts', '0 11 * * *', $$ select public.process_deadline_alerts() $$);
```

## 4. Archivos (Storage)

La migración crea el bucket privado `documents` (PDF e imágenes, hasta 50 MB) y sus políticas; no hay que crearlo a mano. Revisar en **Storage → Settings** que el límite global de subida sea de al menos 50 MB (en el plan gratuito es 50 MB).

## 5. Cobros (pase a pago)

Quien administra la plataforma confirma los pagos en `/admin/cobros`. Se da de alta una sola vez, después de que esa persona ingresó a la app por primera vez:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'tu-correo@dominio.com';
```

Le llega un correo por cada pedido de pase a pago con los datos de facturación; al confirmar el pago, el estudio queda en su plan y recibe un aviso.

## 6. Controles

```sql
-- Correos trabados o fallidos
select id, kind, to_email, status, attempts, last_error, next_try_at
from public.outbox where status <> 'sent' order by id desc limit 50;

-- Reenviar un correo fallido
update public.outbox set status = 'pending', attempts = 0, next_try_at = now() where id = <id>;

-- Últimas ejecuciones del cron
select * from cron.job_run_details order by start_time desc limit 20;
```

## 7. Vercel

Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL`. La app no usa la service role key: todo lo sensible lo resuelve la base con RLS y funciones.
