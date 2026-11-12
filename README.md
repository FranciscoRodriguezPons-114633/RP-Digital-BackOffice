# RP Digital BackOffice

Backoffice para estudios de arquitectura: honorarios y adicionales cobrables, y planos vigentes compartidos con clientes, renderistas y contratistas.

Estado:

- **Sprint 0** (fundaciones): multiempresa, ingreso por enlace mágico, proyectos, invitados externos, auditoría y cola de correos.
- **Sprint 1** (honorarios y horas): etapas con honorario fijo, por hora o mixto, en USD o ARS; plantilla de 4 etapas (croquis preliminar, anteproyecto, documentación de proyecto, dirección de obra); carga de horas desde el teléfono en `/horas`; aviso por correo al dueño cuando una etapa llega al 80% y al 100% de las horas previstas, una sola vez por umbral.
- **Sprint 2** (índices y órdenes de cambio): carga mensual de índices en `/indices` con historial; etapas ajustadas por índice (monto × valor actual ÷ valor del mes base, a 2 decimales); órdenes de cambio con horas, monto y documentos afectados, numeradas por proyecto (OC-001, OC-002…), que se pueden editar mientras no estén aprobadas y anular con motivo. Las aprobadas suman a su etapa.
- **Sprint 3** (aprobación por link y panel): el estudio envía la orden al cliente por correo y, además, ve el link una vez para copiarlo o mandarlo por WhatsApp. El cliente la aprueba o rechaza desde `/aprobar/…`, sin cuenta y desde el teléfono; el link vence a los 14 días, sirve una sola vez y deja de valer si la orden se edita, se reenvía o se anula. Cada decisión guarda nombre, correo, fecha, IP, navegador y la huella del contenido aprobado, y avisa por correo al estudio. El panel `/recuperado` muestra lo aprobado por proyecto y por mes, lo que espera respuesta y los borradores sin enviar. El cliente invitado ve en el proyecto las órdenes que le enviaron. Además arranca lo vigente (E6): cada proyecto tiene sus planos y documentos (A-301, E-201…) con revisiones (C01, C02…) que se suben a Storage; publicar una revisión deja la anterior como reemplazada, y nunca hay dos vigentes del mismo documento.
- **Sprint 4** (lo vigente): piezas dependientes (renders, planos de venta, brochures) hechas sobre una revisión vigente, con un responsable que puede ser un renderista invitado que sube su entrega. Al publicar una revisión nueva, las piezas de la anterior pasan a «a revisar» y su responsable recibe un aviso; en `/a-revisar` se decide si cada una sigue sirviendo o quedó obsoleta. Registro de envíos: qué revisión o pieza exacta (con su huella) se le mandó a cada invitado, cuándo y cuándo la abrió, con aviso si ya no es la vigente. Comentarios por archivo, con página en los PDF, que se resuelven; si comenta un invitado, se avisa al estudio.
- **Sprint 5** (cierre y lanzamiento): comentarios anclados con un pin sobre la imagen y rondas de correcciones por pieza, con aviso al pasar las contratadas. Vencimientos con avisos a 30, 15 y 5 días (o los que se elijan), una sola vez por umbral. Historial completo de cada proyecto y exportación a Excel (etapas, horas y adicionales, con los totales del panel). Puesta en marcha: crear un proyecto copiando otro, carga masiva de planos por nombre de archivo y proyecto de ejemplo. Lanzamiento: página de producto en `/`, términos y privacidad (borradores para revisar con un abogado), prueba de 30 días y pase a pago con cobro manual, que el dueño pide en `/plan` y la plataforma confirma en `/admin/cobros`.

**Finanzas de obra** (en prueba: solo para organizaciones con `works` en `organizations.beta_features`, que carga la plataforma por SQL):

- **Sprint 1** (ficha de obra y estimación paramétrica): la organización se marca como estudio o constructora en `/equipo` (solo el dueño). Cada proyecto tiene su ficha de obra en la pestaña «Obra»: qué papel cumple la organización (construye, dirige o administra), dirección, m² cubiertos y semicubiertos, tipología, calidad, fechas previstas y moneda; los invitados no la ven. En la pestaña «Presupuestos», la estimación paramétrica: (m² cubiertos + semicubiertos × factor) × costo de referencia por m² × coeficiente de tipología × coeficiente de calidad. Se guarda como una versión numerada con el costo de referencia, su fecha y su origen, y muestra el total y el costo por m². Los coeficientes son orientativos y se pueden cambiar en cada versión. `/obras` lista las obras con su última estimación.
- **Sprint 2** (series de referencia y tipo de cambio): la plataforma carga una vez para todos los valores mensuales de CAC (general, materiales y mano de obra), ICC Córdoba, UOCRA por categoría (Zona A, provisoria) y FACPCE RT 6, pegándolos desde una planilla en `/admin/series`. Un valor puede quedar como provisorio; rectificarlo guarda el anterior. En `/indices`, el dueño adopta una serie con un nombre propio: el historial se copia a sus índices y cada valor nuevo o rectificado le llega solo, así que las etapas ajustadas por índice se actualizan sin cargar nada. Un índice adoptado no se edita a mano. También en `/indices`, el tipo de cambio por fecha y fuente (oficial, MEP, CCL, informal); los cálculos usan la última cotización anterior o igual a la fecha (`exchange_rate_at`).
- **Sprint 3** (costo interno, rentabilidad y terceros): en `/equipo`, el dueño carga el costo por hora de cada persona con fecha de vigencia. La tabla la ve y la edita solo el dueño, y el evento de cada cambio no lleva el monto. Cada proyecto muestra su rentabilidad por etapa (honorario actualizado + adicionales aprobados − horas × costo vigente a la fecha de cada hora), separada por moneda y sin convertir. Si a alguien le falta el costo, avisa quién y cuántas horas en vez de tomarlas como cero. `/recuperado` suma una columna de rentabilidad. `/terceros` registra comitentes, proveedores y subcontratistas con CUIT (dígito verificador, único por organización) y condición frente al IVA y a ingresos brutos; el comitente se elige en la ficha de obra.
- **Sprint 4** (biblioteca de insumos): `/insumos` guarda materiales, mano de obra, equipos y personal con código, unidad, precio, moneda, fecha y proveedor, con búsqueda por código o nombre y filtro por tipo. Cada cambio de precio queda en un historial de solo inserción (`/insumos/[id]`). El dueño importa una lista de precios desde Excel en `/insumos/importar`: descarga la plantilla, ve una vista previa con los errores por fila y confirma; si el código ya existe se actualiza el precio (el anterior queda en el historial) sin pisar el nombre, hasta 2.000 filas. La mano de obra puede tomar el precio de una escala UOCRA: valor hora × (1 + el porcentaje de cargas sociales y Fondo de Cese que define el dueño). Cuando la plataforma carga una paritaria nueva, el precio cambia solo.
- **Sprint 5** (análisis de precios): `/analisis-de-precios` lista por rubro cuánto cuesta una unidad de cada tarea. Cada análisis suma componentes: insumo × rendimiento por unidad × (1 + desperdicio). El costo se muestra separado en materiales, mano de obra y equipos, por moneda, y sale de una vista: cambia solo al cambiar un precio. El editor (`/analisis-de-precios/[id]`) calcula en vivo mientras se cargan rendimientos y guarda la lista completa de una vez. El dueño importa análisis de un catálogo de la plataforma: la copia es propia e independiente, los insumos se emparejan por código y los que faltan se crean sin precio (`/insumos` avisa cuántos hay).
- **Sprint 6** (presupuesto por ítem): en la pestaña «Presupuestos» se crea un presupuesto por ítem o por rubros, con los m² y la moneda de la ficha y, si se quiere, la plantilla de 15 rubros típicos. El editor (`/proyectos/[id]/presupuestos/[budgetId]`) arma rubros e ítems; cada ítem se valoriza con un análisis de precios o con un precio directo, puede ir subcontratado y muestra el monto en vivo antes de guardarlo. El resumen separa materiales, mano de obra, equipos, subcontratos y otros, y la suma de las partes da el total al centavo; también da el costo por m². Los insumos en otra moneda se pasan con el tipo de cambio del presupuesto (se propone el último oficial cargado). Solo se edita en borrador; mientras tanto, los montos siguen los precios de los insumos.

El plan completo está en [`docs/plan-desarrollo-mvp.md`](docs/plan-desarrollo-mvp.md) y la propuesta en [`docs/propuesta-mvp-backoffice.md`](docs/propuesta-mvp-backoffice.md). El de Finanzas de obra, en [`docs/plan-sprints-finanzas-de-obra.md`](docs/plan-sprints-finanzas-de-obra.md).

## Stack

- **Next.js 16** (App Router, Server Actions, Cache Components) + Tailwind 4
- **Supabase**: Postgres con RLS, Auth (enlace mágico), Edge Functions, Cron
- **Resend** para correos, **Vercel** para la app
- Pruebas: **pgTAP** (base), **Vitest** (lógica), **Playwright** (punta a punta), CI en GitHub Actions

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

El seed habilita Finanzas de obra para el estudio de ejemplo, deja la ficha de obra de Edificio Alba y carga valores inventados de la CAC general (enero a agosto) para probar la adopción de series, registra al comitente de Edificio Alba como tercero, le pone a Ana un costo por hora inventado para ver la rentabilidad y deja cuatro insumos de ejemplo, uno de ellos atado a la escala UOCRA (también con valores inventados), y carga un catálogo de cuatro análisis de precios con rendimientos ilustrativos, sin validar. Si tu base local es anterior, aplicá la migración con `npx supabase migration up --local` y habilitala a mano: `update public.organizations set beta_features = '{works}' where name = 'Estudio Demo';`.

El seed deja la orden OC-001 de Edificio Alba esperando al cliente, con un link fijo para probar la página de aprobación: <http://localhost:3000/aprobar/link-de-prueba-local-para-aprobar-la-oc-001>.

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
| `npm run test:e2e` | Pruebas punta a punta con Playwright (ver abajo) |

Las pruebas punta a punta (`e2e/`) levantan `next dev` en el puerto 3100 y usan los botones de ingreso de desarrollo, así que necesitan Supabase local recién reseteado (`npx supabase db reset`): aprueban la OC-001, editan la OC-003 después de enviarla, completan la ficha de Casa Norte, importan una lista de insumos, arman un análisis de precio y crean presupuestos por ítem en Edificio Alba. Para volver a correrlas, reseteá la base. La primera vez: `npx playwright install chromium`. En CI corren en `main` y en los PR con la etiqueta `e2e`.

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
- **Links de aprobación:** el token (32 bytes al azar) se devuelve una sola vez y en la base queda solo su SHA-256, en `approval_links`. El correo lo lleva en el outbox hasta que sale; `complete_outbox` lo borra al enviarlo o darlo por perdido. `decide_change_order` valida en la misma transacción que el link no esté usado, vencido ni reemplazado y que la huella de la orden sea la del envío.
- **Editar después de enviar:** la orden vuelve a borrador y el link se anula. Guardar sin cambios no toca nada. Las aprobadas no se editan; se anulan.
- **Quién decide:** el firmante escribe su nombre; el correo es siempre el del destinatario del link, no uno que se pueda tipear. El evento queda a nombre de ese correo.
- **Revisiones y archivos:** bucket privado `documents`, con la ruta `org/proyecto/documento/revisión/archivo`. El navegador sube directo a Storage con un link firmado (los planos pasan el límite de una Server Action), y después el servidor lee el archivo y guarda su SHA-256: la huella sale de lo que quedó guardado, no de lo que dice el navegador. Las políticas de Storage dejan subir solo al lugar exacto de una revisión todavía sin archivo y no permiten reemplazar ni borrar. Las descargas pasan por `/archivos/[id]`, que redirige a un link firmado de un minuto.
- **Una sola vigente:** índice único parcial sobre `revisions (document_id) where status = 'published'`, y `publish_revision` bloquea el documento para ordenar dos publicaciones simultáneas.
- **Piezas a revisar en la misma transacción:** `publish_revision` marca las piezas de la revisión reemplazada y encola un aviso por pieza (al responsable o, si no hay, a los dueños). Revalidar una pieza la pasa a depender de la revisión vigente.
- **Qué vio cada invitado:** `shipment_items` guarda nombre y SHA-256 de lo enviado, no solo un enlace; la descarga por `/archivos/[id]` anota primera y última apertura cuando la hace el destinatario. El invitado ve solo lo que le enviaron o lo que tiene a su cargo.
- **Vencimientos sin spam:** `deadline_alerts` tiene clave única por vencimiento y umbral; si el job diario se saltea días y pasan varios umbrales juntos, sale un solo aviso, el más cercano.
- **Planes sin tocar la base:** el plan del estudio solo lo cambia `decide_billing_request`, que puede llamar solo quien está en `platform_admins` (en local, Ana). El dueño no puede editar su plan.
- **Un estudio por persona** en el MVP (si pertenece a varios, se usa el más antiguo). Se puede agregar un selector más adelante.

Puesta en marcha de staging/producción: [`docs/operacion.md`](docs/operacion.md).
