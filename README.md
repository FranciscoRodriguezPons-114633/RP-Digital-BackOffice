# RP Digital BackOffice

Backoffice para estudios de arquitectura: honorarios y adicionales cobrables, y planos vigentes compartidos con clientes, renderistas y contratistas.

Este repo está en el **Sprint 0** (fundaciones): multiempresa, ingreso por enlace mágico, proyectos, invitados externos, auditoría y cola de correos. El plan completo está en [`docs/plan-desarrollo-mvp.md`](docs/plan-desarrollo-mvp.md) y la propuesta en [`docs/propuesta-mvp-backoffice.md`](docs/propuesta-mvp-backoffice.md).

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
- **Un estudio por persona** en el MVP (si pertenece a varios, se usa el más antiguo). Se puede agregar un selector más adelante.

Puesta en marcha de staging/producción: [`docs/operacion.md`](docs/operacion.md).
