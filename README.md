# RP Digital BackOffice

Backoffice para estudios de arquitectura: honorarios y adicionales cobrables, y planos vigentes compartidos con clientes, renderistas y contratistas.

Estado:

- **Sprint 0** (fundaciones): multiempresa, ingreso por enlace mágico, proyectos, invitados externos, auditoría y cola de correos.
- **Sprint 1** (honorarios y horas): etapas con honorario fijo, por hora o mixto, en USD o ARS; plantilla de 4 etapas (croquis preliminar, anteproyecto, documentación de proyecto, dirección de obra); carga de horas desde el teléfono en `/horas`; aviso por correo al dueño cuando una etapa llega al 80% y al 100% de las horas previstas, una sola vez por umbral.
- **Sprint 2** (índices y órdenes de cambio): carga mensual de índices en `/indices` con historial; etapas ajustadas por índice (monto × valor actual ÷ valor del mes base, a 2 decimales); órdenes de cambio con horas, monto y documentos afectados, numeradas por proyecto (OC-001, OC-002…), que se pueden editar mientras no estén aprobadas y anular con motivo. Las aprobadas suman a su etapa. El envío al cliente por link llega en el Sprint 3.

El plan completo está en [`docs/plan-desarrollo-mvp.md`](docs/plan-desarrollo-mvp.md) y la propuesta en [`docs/propuesta-mvp-backoffice.md`](docs/propuesta-mvp-backoffice.md).

## Stack

- **Next.js 16** (App Router, Server Actions, Cache Components) + Tailwind 4
- **Supabase**: Postgres con RLS, Auth (enlace mágico), Edge Functions, Cron
- **Resend** para correos, **Vercel** para la app
- Pruebas: **pgTAP** (base), **Vitest** (lógica), CI en GitHub Actions

## Arrancar en local

Necesitás Node 22+ y Docker (para Supabase local).

```bash
npm install
npx supabase start            # levanta Postgres, Auth y Mailpit; muestra URL y claves
cp .env.example .env.local    # pegá la URL y la publishable key que mostró el comando
npm run dev                   # http://localhost:3000
```

Los correos del enlace mágico en local llegan a Mailpit: <http://127.0.0.1:54324>.

**Ingreso rápido en desarrollo:** con `npm run dev` y Supabase local, la pantalla de ingreso muestra botones para entrar como Ana (dueña), Beto (miembro) o el cliente invitado, sin correo. Los usuarios y un estudio de ejemplo salen de `supabase/seed.sql`, que se carga con `npx supabase db reset`. En producción esos botones no existen y la nube no recibe el seed.

Para probar el envío de invitaciones en local:

```bash
cp supabase/functions/.env.example supabase/functions/.env   # completar RESEND_API_KEY
npm run functions:serve
curl -X POST http://127.0.0.1:54321/functions/v1/process-outbox \
  -H "Authorization: Bearer <OUTBOX_CRON_SECRET>"
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` / `npm run typecheck` | ESLint y TypeScript |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:db` | Pruebas de la base con pgTAP (requiere `supabase start`) |
| `npm run test:db:local` | Las mismas pruebas sobre un Postgres común, sin Docker (ver `scripts/db/`) |
| `npm run db:reset` | Recrea la base local desde las migraciones |

## Estructura

```
src/
  proxy.ts                  refresca la sesión y protege rutas (antes "middleware")
  lib/supabase/             clientes de Supabase para servidor y proxy
  lib/dal.ts                capa de acceso: usuario y estudio actual
  lib/validation.ts         esquemas zod compartidos
  app/login, app/auth/      ingreso por enlace mágico y callback
  app/(app)/                pantallas autenticadas: proyectos, equipo, onboarding
supabase/
  migrations/               esquema, RLS y funciones (RPC)
  tests/database/           pruebas pgTAP de aislamiento y permisos
  functions/process-outbox/ envío de correos desde la cola
docs/                       propuesta, plan, operación, guía de entrevistas
```

## Decisiones de Sprint 0

- **Multiempresa por `org_id`** en todas las tablas, con RLS. Las funciones de permisos viven en el esquema `private`, que la API no expone.
- **Las escrituras sensibles pasan por funciones** (`create_organization`, `invite_guest`, `invite_member`, …) que validan permisos y dejan un registro en `events` en la misma transacción. `events` no se puede editar ni borrar desde la app.
- **Invitados externos gratis**: clientes, renderistas y contratistas entran con su correo y solo ven los proyectos a los que fueron invitados. Al iniciar sesión, `claim_invitations()` vincula las invitaciones pendientes.
- **Correos por cola (outbox)**: la invitación y su correo se guardan juntos; si Resend falla no se pierde nada y se reintenta.
- **La app no usa la service role key**. Solo la Edge Function la usa, para procesar la cola.
- **Honorarios en la base:** la vista `fee_stage_summary` calcula horas usadas, honorario y porcentaje con las mismas reglas de acceso que las tablas. Fija = monto; por hora = horas × tarifa; mixta = monto + horas que pasan de lo previsto × tarifa. Los totales se muestran por moneda, sin convertir.
- **Quién toca qué:** el dueño crea y edita etapas; los miembros las ven y cargan sus propias horas; los invitados no ven honorarios ni horas.
- **Ajuste por índice en la base:** `fee_stage_summary` toma el último valor cargado del índice de cada etapa y el del mes base. Si falta el del mes base, la etapa queda sin ajustar y la pantalla avisa qué valor falta.
- **Órdenes de cambio por funciones:** `create_change_order` numera con un bloqueo sobre el proyecto (sin números repetidos aunque dos personas creen a la vez); `update_change_order` y `void_change_order` validan el estado. Cada orden guarda una huella SHA-256 de su contenido (`content_hash`), que cambia con cualquier edición: es la base para que un link de aprobación deje de valer si la orden cambió.
- **Formularios que no borran lo escrito:** `useActionForm` (en `src/components/form.tsx`) evita que React vacíe el formulario cuando la acción devuelve un error.
- **Un estudio por persona** en el MVP (si pertenece a varios, se usa el más antiguo). Se puede agregar un selector más adelante.

Puesta en marcha de staging/producción: [`docs/operacion.md`](docs/operacion.md).
