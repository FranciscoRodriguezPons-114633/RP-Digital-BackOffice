# Prompt: plan de sprints semanales para Finanzas de obra, Presupuesto y Contabilidad

> Para usar en Claude Code (o en otro agente) con el repositorio AA-Backoffice abierto. Copiá desde "Rol" hasta el final.
> Versión 2 (19/10/2026): 20 h por semana, primera versión con compuerta, papel de la empresa en la obra, biblioteca de precios y rendimientos, generalizaciones técnicas y planificación por oleadas.

---

## Rol

Sos un líder técnico y de producto con experiencia en SaaS B2B sobre Next.js + Supabase y en gestión de obra y contabilidad en Argentina. Tu tarea es **planificar**, no programar: armá un plan de sprints de **1 semana** para construir las mejoras descriptas abajo sobre el producto existente.

## Contexto: leé esto antes de planificar

Leé completos estos archivos del repositorio. Son la fuente de verdad; si algo de este prompt los contradice, avisá.

1. `README.md`: estado de los sprints 0 a 5 y decisiones técnicas.
2. `AGENTS.md`: la versión de Next.js tiene cambios incompatibles; consultá `node_modules/next/dist/docs/` antes de proponer APIs.
3. `docs/analisis-y-roadmap-finanzas-de-obra.md`: análisis, competencia, flujo contable, modelo de datos propuesto, decisiones y features nuevas. **Es el documento base de este plan.**
4. `docs/propuesta-mvp-backoffice.md` y `docs/plan-desarrollo-mvp.md`: propuesta original y formato del plan anterior. Imitá su estilo: español rioplatense, tablas y criterios de aceptación verificables.
5. `supabase/migrations/*.sql` y `supabase/tests/database/*.sql`: esquema real, funciones RPC, RLS y patrón de pruebas.
6. `src/app/(app)/` y `src/lib/`: pantallas, server actions, `dal.ts` y validación con zod.

**Resumen del producto:** RP Digital BackOffice es un SaaS multiempresa (`org_id` + RLS) para estudios de arquitectura. Ya tiene:
- honorarios por etapa (fijo, por hora o mixto; ARS o USD) y horas;
- índices con ajuste (`price_indices`);
- órdenes de cambio aprobadas por link sin cuenta, con hash (`change_orders`, `approval_links`);
- revisiones de planos con una sola vigente y piezas dependientes que pasan a "a revisar";
- registro de envíos, comentarios anclados y vencimientos;
- invitados externos (cliente, renderista, contratista);
- `events` inmutable, `outbox` → Resend, exportación a Excel;
- pruebas pgTAP y Vitest, y CI.

Todavía **no tiene clientes que paguen**.

## Decisiones ya tomadas (no las discutas: planificá sobre ellas)

1. **Segmento:** el módulo nuevo se vende a **estudios que dirigen o administran obra y a constructoras pyme**, con planes distintos. La funcionalidad se habilita por plan y por tipo de organización.
2. **Alcance contable: todo, por etapas.**
   - **A.** Finanzas de obra.
   - **B.** Contabilidad de gestión con partida doble.
   - **C.** Integraciones y contabilidad legal a través del contador.

   Libros rubricados, liquidación de impuestos, ajuste por inflación y balance firmado **no se construyen**: se exportan o se integran (Xubio por API REST/OAuth2, Colppy por CSV o API, Tango por archivo).
3. **Orden:** se arranca por **finanzas de obra**. Lo pendiente del MVP se intercala donde haga falta, sin bloquear el arranque: cobro automático del plan, pruebas punta a punta con Playwright, revisión legal de términos y privacidad, Sentry y límites de pedidos.
4. **Ritmo:** sprints de **1 semana**, una sola persona, `HORAS_POR_SEMANA = 20`. Capacidad planificable: **17 h por sprint** (15% de reserva para imprevistos y calidad). Descontá los feriados nacionales y una semana de vacaciones en verano; anotalo como supuesto.
5. **Primera versión vendible (R1) y compuerta:**
   - **R1 incluye:** el núcleo de F0, lo mínimo de P1, P2 (por lo menos los niveles paramétrico y por ítem) y A1 (certificados), más las generalizaciones técnicas que estas épicas necesiten.
   - **Meta:** que R1 entre en **14 sprints o menos**. Si no entra, proponé recortes explícitos dentro de R1 y no corras la fecha en silencio.
   - **Compuerta después de R1:** R1 tiene que estar en uso con **3 a 5 socios de diseño, al menos uno de ellos una constructora**. B y C se comprometen solo si la compuerta se cumple; definí las métricas.

## Qué hay que planificar (épicas)

Usá estos códigos de épica. Podés partirlas, pero no sacar alcance sin decirlo.

| Código | Épica | Contenido mínimo |
| --- | --- | --- |
| F0 | Fundaciones del módulo | Tipo de organización (estudio o constructora) y habilitación por plan. Ficha de obra (dirección, m², tipología, calidad, fechas, comitente, modalidad de contrato, moneda e índice). **Papel de la empresa en la obra** (ver la regla más abajo). Terceros (`parties`: CUIT, condición frente al IVA y a IIBB, roles). Tipos de cambio. Carga automática o semiautomática de índices (CAC, ICC Córdoba, escala UOCRA, FACPCE RT 6) con marca de provisorio. Costo interno por hora de cada miembro, con vigencia |
| P1 | Presupuesto: insumos y APU | Biblioteca de insumos: materiales, categorías de mano de obra UOCRA con coeficiente de cargas y Fondo de Cese, equipos, personal. Análisis de precios unitarios (APU) con rendimientos y desperdicio. Importación de listas de precios desde Excel. **Estrategia de contenido** (ver la regla más abajo) |
| P2 | Presupuesto estimado del proyecto | Tres niveles ligados a las etapas: paramétrico (m² × costo de referencia × coeficientes), por rubros y por ítem. Incluye **materiales + horas de obreros + personal e indirectos + horas de arquitectos** (desde `fee_stages` y `time_entries` × costo interno). Coeficiente de pase, versiones, comparación entre versiones, actualización por índice, exportación a Excel y PDF. Envío al cliente con aprobación por link (requiere G1). La versión aprobada queda como presupuesto contractual |
| P3 | Cómputo asistido | **Ver la sección 6.2 del análisis.** Orden: (1) prueba de concepto de 1 sprint con criterio de sigue o no sigue; (2) cantidades desde IFC (`Qto_` o geometría; requiere G3); (3) planos PDF con escala calibrada por el usuario e IA con visión; (4) renders para identificar terminaciones, no cantidades. Toda cantidad de IA queda "estimada", con origen y confianza, hasta que una persona la confirma. Cada cómputo se ata a la revisión exacta y su SHA-256; al publicarse una revisión nueva, el cómputo y el presupuesto pasan a "a revisar" (requiere G2). Proceso asíncrono con cola, costo de IA por organización y declaración del proveedor en la política de privacidad |
| A1 | Contrato y certificados | Contrato con el comitente: índice base, rezago, % de anticipo, % de fondo de reparo, criterio de reconocimiento de ingresos parametrizable. Certificados mensuales por ítem (anterior, período y acumulado) con adicionales que salen de las órdenes de cambio aprobadas, ajuste CAC, descuento de anticipo, fondo de reparo y acopio. Aprobación del comitente por link (requiere G1). Garantías y pólizas. **El flujo cambia según el papel de la empresa en la obra** |
| A2 | Compras y subcontratos | Pedido → orden de compra → remito → factura del proveedor (control en tres vías), imputados a obra e ítem. Subcontratos con certificados que carga el contratista invitado y aprueba el director de obra; fondo de reparo retenido. Partes diarios (reutilizar horas) |
| A3 | Comprobantes | Comprobantes emitidos y recibidos (tipo, punto de venta, número, CAE, alícuotas, percepciones, moneda). Carga por QR de ARCA y por foto con OCR o IA, con archivo y SHA-256. "Facturado" y "cobrado" para etapas y órdenes de cambio: activar el estado `billable`, que hoy no usa nadie |
| A4 | Tesorería y cuentas corrientes | Cajas y fondos fijos por obra con rendiciones, cuentas bancarias por moneda, importación de extractos (CSV) y conciliación, cheques y ECHEQ con estados, órdenes de pago con retenciones informativas, recibos con aplicación, cuentas corrientes de clientes, proveedores y subcontratistas. **Fondos del comitente separados de los propios** cuando la empresa administra la obra |
| A5 | Tablero de obra | Presupuesto vs. real por ítem, curva S, margen por obra, rentabilidad del estudio (honorario ajustado − horas × costo interno), flujo de fondos proyectado ARS/USD, saldos de anticipo y fondo de reparo. Vistas SQL al estilo de `fee_stage_summary` |
| B1 | Contabilidad de gestión | Plan de cuentas (plantilla de constructora y de estudio), ejercicios y períodos con cierre, `journal_entries`/`journal_lines`, centros de costo ligados a obras, asientos automáticos por `posting_rules` desde cada operación de A1 a A4, reversión en lugar de edición, numeración correlativa sin huecos, cadena de hash. Los fondos de terceros (obra por administración) van a cuentas de pasivo, no a ingresos |
| B2 | Reportes contables de gestión | Libro Diario, Mayor, Sumas y saldos, Situación patrimonial y Resultados "de gestión", subdiarios de IVA compras y ventas informativos, exportación a Excel y PDF |
| C1 | Integraciones | Exportación de asientos compatible con Colppy (CSV) y genérica para el contador; API de Xubio (comprobantes y asientos); exportación para Tango y Holistor (formato a relevar) |
| C2 | Factura electrónica | Emitir primero a través de Xubio o Colppy; WSFE directo con ARCA solo si se justifica (certificado por empresa y custodia de la clave) |
| C3 | Fideicomisos al costo | Fideicomiso como entidad contable propia (`ledgers`), fiduciantes y unidades, planes de cuotas ajustadas por CAC, rendición de cuentas anual |
| G1 | Generalizar aprobaciones por link | Hoy `approval_links.change_order_id` es obligatorio: los links solo sirven para órdenes de cambio. Hay que generalizarlos para presupuestos y certificados, por ejemplo con `subject_type` + `subject_id`, o con FK opcionales y un `check` de "exactamente uno". Incluye migrar los links existentes, mantener `decide_change_order` y `/aprobar/[token]` funcionando, y pgTAP de regresión de todo el flujo actual |
| G2 | Generalizar "a revisar" | Hoy `dependencies` está modelada para archivos: tipos `render`/`sales_plan`/`brochure`/`other`, y formato y tamaño del archivo. Que un presupuesto o un cómputo dependa de una revisión y pase a "a revisar" al publicarse otra requiere una dependencia que no sea un archivo. `publish_revision` tiene que marcarla en la misma transacción |
| G3 | Modelos IFC | Hoy `revisions` acepta solo PDF, PNG, JPEG y WebP de hasta 50 MB, y los modelos IFC suelen pesar más. Hay que definir dónde se guardan (límite de Supabase Storage o Cloudflare R2, que ya menciona la propuesta), los formatos aceptados y dónde se leen: web-ifc en el navegador (WASM) o IfcOpenShell en un servicio aparte, porque las Edge Functions corren en Deno y no ejecutan Python |
| X | Pendientes del MVP y calidad | Cobro automático del plan (suscripciones de Mercado Pago), Playwright en los flujos críticos (aprobación por link, publicación de revisión, certificado, asiento), Sentry, límites de pedidos, términos y privacidad revisados, actualización de planes y precios para el segmento constructora |

## Reglas de dominio que el plan tiene que respetar

### Papel de la empresa en la obra

Cada obra tiene un campo que dice qué papel cumple la organización. Cambia el flujo, los permisos y los asientos [I][C]:

| Papel | Qué hace con los certificados | Qué es plata propia | Qué es de terceros |
| --- | --- | --- | --- |
| **Constructor** (contratista principal) | Emite certificados al comitente y los cobra | El certificado es ingreso propio | — |
| **Director de obra** | Controla y aprueba (o observa) los certificados que el contratista presenta al comitente | Sus honorarios (ya modelados en `fee_stages`) | Nada: no maneja el dinero de la obra |
| **Administrador** (obra por administración) | Recibe fondos del comitente, contrata y paga gremios y materiales en su nombre, y le rinde cuentas | Sus honorarios, a menudo un % del costo | **Los fondos del comitente**: pasivo, con rendición de cuentas periódica |

Las preguntas sobre el tratamiento contable e impositivo de cada papel van a la lista de validaciones con el contador, antes de A1 y B1.

### Biblioteca de precios y rendimientos

El presupuesto no sirve sin contenido. Planificá explícitamente:

- **Biblioteca base chica y curada:** por ejemplo, de 30 a 60 ítems frecuentes de vivienda y edificio en Córdoba, con rendimientos revisados por un profesional de cómputos. Es una tarea externa con fecha, no código.
- **Precios propios de cada organización**, cargados o importados desde Excel o listas de proveedores; el producto no promete precios de mercado.
- **Referencia de costo por m²** (ICC Córdoba, CAC) actualizada por índice.
- **Escala UOCRA** cargada al cambiar cada paritaria.

Indicá quién mantiene cada parte y con qué frecuencia. Si quien mantiene la biblioteca base no está definido, dejalo como pregunta abierta para Francisco en el resumen.

## Reglas técnicas que el plan tiene que respetar

- **Mismo patrón que el código existente:**
  - Tablas en inglés con `org_id` y RLS, con los helpers del esquema `private`.
  - Escrituras sensibles por funciones SQL que validan y escriben en `events` en la misma transacción.
  - Numeración con bloqueo por fila, como `create_change_order`.
  - Hashes SHA-256, como `content_hash`.
  - Correos por `outbox`.
  - La app no usa la service role key.
- **Antes de reutilizar algo existente, verificá en el esquema que de verdad se pueda reutilizar.** Si hay que generalizarlo, planificá la migración y las pruebas de regresión (ver G1 a G3).
- **Importes:** `numeric(18,2)`. Tipos de cambio, índices y rendimientos: `numeric(18,6)`. Los totales nunca mezclan monedas sin un tipo de cambio explícito y congelado.
- **Contabilidad:**
  - Asiento balanceado validado por constraint trigger diferido.
  - Asientos contabilizados inmutables: solo se corrigen con contraasiento (CCyC art. 324).
  - No se puede registrar en un período cerrado.
  - El número se asigna al contabilizar.
  - Todo se presenta como **contabilidad de gestión**, no como libros legales.
- **Normativa:** no inventes alícuotas, mínimos ni regímenes. Todo lo marcado [C] en el análisis queda como tarea "validar con el contador" **antes** del sprint que lo usa.
- **Definición de terminado de cada sprint:**
  - Migración con pruebas pgTAP de aislamiento entre organizaciones y de reglas de estado.
  - Vitest para los cálculos.
  - Playwright para el flujo principal de la épica, cuando haya interfaz. Playwright todavía no está instalado: incluí su puesta en marcha en uno de los primeros sprints.
  - Lint, tipos y build en verde.
  - Demo de 5 minutos.
  - README actualizado con las decisiones.
- **Interfaz:** español rioplatense, adaptable al teléfono (el director de obra carga desde la obra), con la barra lateral actual. Agregá un grupo "Obra" y otro "Contabilidad" a `sidebar-nav.tsx`, visibles según plan y rol.
- **Permisos:**
  - El dueño ve todo.
  - Los miembros cargan, pero no aprueban pagos ni cierran períodos.
  - El contratista invitado ve solo su subcontrato, sus certificados y sus órdenes de compra.
  - El comitente ve presupuestos y certificados enviados y, en obras por administración, su rendición de cuentas.
  - Evaluá si hace falta un rol nuevo "contador" (lectura de contabilidad y exportaciones) y, si hace falta, planificalo.

## Cómo ordenar

- **Rebanadas verticales:** cada sprint deja algo demostrable de punta a punta (base + función + pantalla + prueba), no "solo migraciones". Con 17 h por sprint, las rebanadas son finas: preferí una función completa a tres a medias.
- **Respetá las dependencias:**
  - F0 → P1 → P2.
  - G1 antes de enviar presupuestos o certificados por link.
  - G2 antes de que presupuestos y cómputos pasen a "a revisar".
  - G3 antes de cargar modelos IFC.
  - P2 (presupuesto contractual) → A1 (certificados).
  - A1–A4 → A5.
  - A1–A4 → B1 → B2 → C1/C2.
  - P3 necesita P1 y P2, pero su prueba de concepto puede ir antes o en paralelo si conviene validar el riesgo temprano.
  - C3 al final.
- El **primer sprint** tiene que ser chico y dejar algo visible (por ejemplo la ficha de obra con el papel de la empresa y el presupuesto paramétrico de nivel 1).
- **Planificación por oleadas:**
  - Detallá completos **solo los primeros 8 sprints**.
  - El resto, a nivel de épica: épica, sprints estimados, horas, dependencias y riesgos, sin historias de usuario.
  - Indicá en qué compuerta se vuelve a planificar la oleada siguiente.
- Cada 4 o 5 sprints poné una **compuerta** de sigue, corrige o frena con métricas concretas, y un sprint o medio sprint de endurecimiento (deuda, rendimiento, pruebas punta a punta, X). La compuerta posterior a R1 es obligatoria (decisión 5).
- Si el total supera lo razonable, proponé qué recortar o postergar, en orden, como hace `plan-desarrollo-mvp.md` §9.

## Formato de la respuesta

Escribí el resultado en **`docs/plan-sprints-finanzas-de-obra.md`**, con esta estructura:

1. **Resumen.**
   - Cantidad de sprints y horas totales.
   - Fecha estimada de fin de R1 y de cada etapa (A, P, B, C), contando desde el lunes 26/10/2026.
   - Supuestos (feriados y vacaciones incluidos).
   - Preguntas abiertas para Francisco.
2. **Mapa de etapas e hitos.** Tabla: etapa, sprints, entrega demostrable, compuerta.
3. **Primera oleada: sprints 1 a 8.** Un bloque por sprint con:
   - número y fechas;
   - objetivo (una frase);
   - épicas;
   - historias de usuario ("Como … quiero … para …") con **criterios de aceptación verificables**;
   - cambios de base (tablas, funciones, vistas, RLS);
   - pantallas y rutas;
   - pruebas (pgTAP, Vitest, Playwright);
   - horas estimadas por tarea, con un total que no supere 17 h;
   - dependencias;
   - riesgos;
   - qué se muestra en la demo.
4. **Oleadas siguientes.** Tabla por épica: sprints estimados, horas, dependencias, riesgos y compuerta en la que se replanifica.
5. **Modelo de datos acumulado.** Tablas nuevas por etapa y cómo se relacionan con las existentes (`projects`, `fee_stages`, `time_entries`, `change_orders`, `approval_links`, `price_indices`, `revisions`, `dependencies`, `project_guests`, `events`), incluyendo los cambios de G1 a G3.
6. **Validaciones externas.** Lista de preguntas para el contador, el abogado y el profesional de cómputos, con el sprint antes del cual tienen que estar respondidas. Incluí el tratamiento de cada papel en la obra y la curaduría de la biblioteca base.
7. **Planes y precios.** Cómo se reparte la funcionalidad entre los planes de estudio y de constructora (hipótesis a validar, en el mismo estilo que la propuesta §7).
8. **Riesgos y recortes.** Tabla de riesgos con mitigación y la lista ordenada de qué recortar si hay atraso, empezando por lo que se puede sacar de R1.
9. **Métricas.** Qué medir desde el primer sprint de cada etapa y cuáles deciden la compuerta posterior a R1.

Antes de escribir, si algo te **bloquea de verdad**, hacé como máximo 3 preguntas. Si no, avanzá: anotá cada supuesto al principio del documento y marcá lo inferido con [I] y lo que hay que validar con un profesional con [C].
