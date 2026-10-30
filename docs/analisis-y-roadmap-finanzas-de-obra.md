# Análisis del proyecto, mercado y roadmap: finanzas y contabilidad de obra

Actualizado: 19/10/2026 · Para: Francisco · Complementa a `propuesta-mvp-backoffice.md` y `plan-desarrollo-mvp.md` · Plan de sprints: `plan-sprints-finanzas-de-obra.md`

**Marcas:** **[V]** dato verificado en la fuente citada · **[I]** inferencia o criterio propio · **[C]** validar con contador o abogado antes de construir.

---

## Resumen

- **Qué es hoy:** RP Digital BackOffice es un SaaS multiempresa para estudios de arquitectura de 2 a 15 personas. Une honorarios por etapa, horas, ajuste por índice y órdenes de cambio que el cliente aprueba por link, con control de lo vigente: revisiones, piezas dependientes, envíos y comentarios. Los 6 sprints del MVP (0 a 5) están terminados y hay una primera fase de UI.
- **Su diferencial sigue siendo único:** ningún competidor revisado (33 en la propuesta y 20 más en este análisis) une la aprobación de cambios sin cuenta, con hash, con los honorarios por etapa y las piezas que quedan desactualizadas.
- **Lo que le falta para cerrar el circuito del dinero:** hoy el sistema sabe cuánto se aprobó, pero no cuánto se facturó, se cobró ni se gastó. El estado `billable` existe en la base y nunca se usa, y no hay costo interno por hora. Es el puente natural hacia la contabilidad.
- **Sobre la contabilidad de constructora:** conviene **construir las finanzas de obra y una contabilidad de gestión con partida doble**, e **integrar o exportar la contabilidad legal**: libros rubricados, ARCA, IVA Simple, IIBB y ajuste por inflación quedan en el sistema del contador (Xubio y Colppy tienen API). Es lo mismo que hacen las plataformas chicas de EE. UU. con QuickBooks.
- **Decisiones tomadas:** módulo para estudios y constructoras, contabilidad completa por etapas, se arranca por finanzas de obra, sprints de una semana a 20 h, y una primera versión vendible (R1) con compuerta antes de la contabilidad (sección 5). Se suman el **presupuesto estimado** (materiales y mano de obra) y el **cómputo de materiales asistido** (sección 6).

---

## 1. El proyecto hoy

### 1.1 Objetivo y alcance

La frase de venta es: **"Cobrá cada cambio que te pide el cliente y que nadie trabaje con un plano viejo"**. El MVP "calcula, ordena y avisa, pero nunca actúa ante un organismo ni mueve dinero". Por eso la propuesta original dejó afuera, a propósito, la facturación ARCA, la contabilidad, los cobros y los trámites (propuesta, §4).

| Área | Qué hace | Dónde está |
| --- | --- | --- |
| Base | Multiempresa por `org_id` con RLS; ingreso por enlace mágico; dueño y miembros; invitados externos gratis (cliente, renderista, contratista); `events` inmutable; correos por `outbox` → Resend | `20261015*`, `/equipo`, `/onboarding` |
| Plata del proyecto | Etapas de honorarios fijas, por hora o mixtas, en ARS o USD, con plantilla de 4 etapas; horas desde el teléfono con avisos al 80% y al 100%; índices mensuales y ajuste por índice; órdenes de cambio OC-001… que se anulan con motivo | `/horas`, `/indices`, `fee_stage_summary` |
| Aprobación | Link de un solo uso que vence a los 14 días y se invalida si cambia el hash; guarda firmante, IP y navegador; panel `/recuperado` por proyecto y por mes | `/aprobar/[token]`, `change_order_recovery*` |
| Lo vigente | Documentos y revisiones con una sola publicada; piezas dependientes que pasan a "a revisar"; registro de envíos con SHA-256 y aperturas; comentarios por página y con pin; rondas | `/a-revisar`, secciones del proyecto |
| Transversal | Vencimientos con umbrales; historial; exportación a Excel; copiar proyecto; carga masiva; proyecto de ejemplo; planes (prueba de 30 días, cobro manual) | `/vencimientos`, `/plan`, `/admin/cobros` |

### 1.2 Estado técnico

- **Stack:** Next.js 16 (App Router, Server Actions) + Tailwind 4; Supabase (Postgres con RLS, Auth, Storage, Edge Functions); Resend; Vercel; ExcelJS; zod.
- **Tamaño:** 13 migraciones (~3.200 líneas de SQL), 23 tablas, 3 vistas, ~55 funciones (RPC y helpers en el esquema `private`), ~11.400 líneas en total.
- **Calidad:** 14 suites pgTAP (aislamiento, permisos y reglas de estado), Vitest para formato y validación, CI con lint, tipos, build, pgTAP y chequeo de la Edge Function.
- **Buenas decisiones que conviene reutilizar en el módulo contable:**
  - Las escrituras sensibles pasan por funciones SQL que validan la operación y escriben en `events` en la misma transacción.
  - Las huellas SHA-256 garantizan la inmutabilidad.
  - Los bloqueos por fila evitan numeraciones duplicadas.
  - El outbox hace que un correo fallido no se pierda.

  Son exactamente las mismas reglas que exige un libro diario: asiento inmutable, numeración correlativa y corrección solo con contraasiento.

### 1.3 Huecos y deuda detectados

| # | Hallazgo | Impacto | Evidencia |
| --- | --- | --- | --- |
| 1 | El estado `billable` de `change_orders` existe, pero ninguna función ni pantalla lleva a él. Tampoco se registra si una etapa u orden se facturó o se cobró | El circuito del dinero termina en "aprobado". El estudio sigue usando Excel para saber qué le deben | `20261017000000_indices_y_ordenes.sql:47`; sin usos fuera de los `check` y `filter` |
| 2 | No hay costo interno por hora (`hourly_rate` es la tarifa que se cobra) | No se puede calcular la rentabilidad real por proyecto, que es uno de los dolores de la propuesta | No existe ningún campo de costo en `memberships` ni en `time_entries` |
| 3 | `projects` tiene solo nombre, código, cliente y estado | Sin dirección, m², tipología, fechas ni presupuesto de obra, no hay base para obra ni para centros de costo | `20261015000000_base_multiempresa.sql:45` |
| 4 | No hay pruebas punta a punta (Playwright estaba en el plan, §2 y §8) | Los flujos críticos (aprobación por link, publicación) solo se prueban por partes | No figura en `package.json` |
| 5 | No hay módulo de tareas: la propuesta suponía un "gestor actual" con tareas | Falta algo que el estudio usa todos los días | No hay tabla de tareas |
| 6 | Un estudio por persona | Bloquea a contadores, renderistas y consultores que trabajan con varios estudios | README, "Decisiones" |
| 7 | El cobro del plan es manual y los índices se cargan a mano | Fricción operativa a medida que crecen las cuentas | `/admin/cobros`, `/indices` |
| 8 | Términos y privacidad en borrador | Requisito para cobrar | README, Sprint 5 |

### 1.4 Tensión estratégica

El pedido nuevo (contabilidad de constructora) **contradice la lista de "no" de la propuesta**: la §4 deja afuera "Contabilidad e impuestos" y la tabla de riesgos advierte que "Te dispersás construyendo funciones de otros (cuotas, facturación, CRM)" tiene probabilidad alta. No significa que esté mal, pero sí que hay que elegir conscientemente **quién compra el módulo nuevo** (sección 5) y respetar el principio de **no asumir la responsabilidad fiscal**.

---

## 2. Mercado: aplicaciones similares y comparación

### 2.1 Lo que ya cubría la propuesta

Monograph, BQE Core, Mosaic, Weeker y Fixner (gestión de estudios); Houzz Pro, JobTread, Buildertrend, Archdesk y Procore (órdenes de cambio); Aconex, Newforma, Autodesk Docs, Dalux, Bluebeam y Revizto (documentos); Filestage y ReviewStudio (renders); Urbantify, MOBU, Winbuild y Urbania 3D (unidades). Conclusión de entonces: **nadie une honorarios por etapa + cambios aprobados por el cliente + dependencias de planos**. Sigue siendo cierto [I].

### 2.2 Nuevos: gestión financiera y contable de obra

| Producto | Mercado | Qué cubre | Precio | Lectura |
| --- | --- | --- | --- | --- |
| **Lebane** | AR/MX; desarrolladoras y constructoras; más de 400 clientes | Compras, presupuestos, contratos, cuentas corrientes, flujo de caja, contabilidad. En 2026 sumó agentes de IA ("Carga" lee facturas que llegan por **WhatsApp**), pagos con licencia **PSP** y un fondo para financiar obras [V] | Capterra informa "US$6.000 por feature por año" [V]; el dato es poco claro, no usarlo para vender | El competidor local más fuerte en finanzas de obra; caro y orientado a medianas [I] |
| **Finnegans** (vertical constructoras) | AR | Presupuesto con desvíos, compras por proyecto, stock, maquinaria, avance. Agentes de obra (chat o voz), de compras y de tesorería que **concilia bancos**. API con webhooks [V] | A cotizar | ERP completo; la página no menciona certificados [V] |
| **Softland Constructoras** | AR | Presupuestos, **certificaciones**, contratos, contabilidad y rentabilidad por obra [V] | A cotizar | ERP tradicional con implementación [I] |
| **Bejerman** (Thomson Reuters) | AR, pymes | Contabilidad, impuestos, Libro IVA, IA para cargar comprobantes, WhatsApp B2B. **Sin vertical de obra** [V] | A cotizar | — |
| **Tango Nube** (Axoft) | AR, pymes | ERP genérico; para obra se adapta Compras y se compara con Excel [V] | $731.000 + IVA para 2 puestos (la fuente no aclara el período) [V] | Caro para un estudio chico [I] |
| **Xubio** | AR | Diario, mayor, balance, ajuste por inflación, factura electrónica, **conciliación (Excel e Interbanking)**, IA para comprobantes. **API REST con OAuth2** [V] | Gratis (10 facturas); de $128.000 a $397.700 por mes [V] | Candidato de integración número 1 |
| **Colppy** | AR | Facturación ARCA, retenciones, tesorería multimoneda, conexión bancaria; **importa asientos por CSV**; API JSON [V] | De $128.500 a $310.900 por mes [V] | Candidato número 2 |
| **Alegra** | CO/AR | Contabilidad y factura electrónica para micro y pequeñas empresas; API según terceros [V] | ~$20.000 a $80.000 por mes [V] | Opcional |
| **Odoo + Forge** | Global | Presupuestos BC3, **certificaciones mensuales**, subcontratos, partes diarios; localización AR de ADHOC [V] | Módulo de US$554 + integrador | Pensado para España [I] |
| **Foco en Obra** | CL/AR | Costos, presupuestos, órdenes de cambio, pagos, app [V] | Sin precio publicado; un tercero con sesgo estima ~USD 50 por mes [V] | Competidor cercano en precio |
| **Constructora360** | MX | Presupuesto, compras, estimaciones, caja proyectada, nómina, portales, PWA [V] | **Gratis hasta 3 obras**; luego de MXN 499 a 2.499 [V] | El modelo freemium que no existe en AR [I] |
| **Sage Intacct Construction, Foundation, Vista, Premier** | EE. UU. | Libro mayor nativo, WIP, retención de garantía (*retainage*), facturación por avance [V] | Premier desde USD 125 por usuario por mes [V] | Referencia funcional; críticas por interfaces viejas [V] |
| **Buildertrend, Knowify, Contractor Foreman** | EE. UU. | Obra y órdenes de cambio; **no hacen contabilidad: sincronizan con QuickBooks, Xero o Sage**. Buildertrend sumó OCR de facturas y facturación por avance (09/2026) [V] | USD 49 a 332 por mes (Contractor Foreman) [V] | El patrón a imitar [I] |

### 2.3 Comparación de funciones

✅ tiene · ◐ parcial · ❌ no tiene · ? no verificado

| Función | RP Digital | Lebane | Finnegans | Softland | Xubio/Colppy | Odoo+Forge | Foco en Obra |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Honorarios por etapa con ajuste por índice | ✅ | ? | ❌ | ❌ | ❌ | ❌ | ? |
| Órdenes de cambio aprobadas por link, sin cuenta y con hash | ✅ **único** | ? | ❌ | ❌ | ❌ | ❌ | ◐ |
| Revisiones de planos con piezas dependientes | ✅ **único** | ❌ | ❌ | ◐ | ❌ | ❌ | ◐ |
| Invitados externos gratis | ✅ | ? | ❌ | ❌ | ◐ | ❌ | ? |
| Presupuesto y cómputo de obra | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Certificados de avance | ❌ | ? | ❌ | ✅ | ❌ | ✅ | ? |
| Compras, OC y subcontratos | ❌ | ✅ | ✅ | ✅ | ◐ | ✅ | ? |
| Caja, bancos y cuentas corrientes | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ |
| Libro diario, mayor y balance | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Centro de costo por obra | ◐ (proyecto) | ✅ | ◐ | ✅ | ? | ✅ | ✅ |
| Factura electrónica ARCA | ❌ | ? | ◐ | ? | ✅ | ✅ | ❌ |
| IA/OCR de comprobantes, WhatsApp | ❌ | ✅ | ✅ | ❌ | ✅ (Xubio) | ❌ | ❌ |
| Precio de entrada | **USD 49** | alto | a cotizar | a cotizar | ~$128.000 | licencia + integrador | a cotizar |

### 2.4 Tendencias 2025-2026

1. **Carga de comprobantes con IA, OCR o QR de ARCA** ya es lo mínimo esperado: la ofrecen Lebane, Xubio, Finnegans, Bejerman y Buildertrend [V].
2. **WhatsApp y voz como forma de cargar datos en obra** (Lebane, Finnegans, CERP Tech) [V].
3. **Fintech embebida:** pagos y crédito dentro de la plataforma (Lebane con PSP) [V].
4. **Conciliación bancaria automática** por Excel o Interbanking (Xubio, Colppy). **Open Finance** (Decreto 353/2025) no estará masivo antes de **2027** [V].
5. **Más factura electrónica:** la RG ARCA 5893/2026 la extiende desde el 01/11/2026. Habrá más contratistas chicos con comprobantes electrónicos legibles por QR [V].

### 2.5 Huecos donde entrar [I]

- **El estudio que dirige o administra obra** (y la constructora chica) no tiene una herramienta a su medida: Lebane y Finnegans son ERP caros, y Xubio y Colppy son contabilidad sin obra.
- **Las finanzas de obra vistas desde la dirección de obra**: certificados de contratistas aprobados por link, fondo de reparo, cuenta corriente del comitente con ajuste CAC y rendición de gastos por obra. Se apoya directamente en lo que ya existe: órdenes de cambio, índices, invitados contratistas y hash.
- **Precio pyme y freemium** en Argentina.

---

## 3. Propuestas de desarrollo

Están ordenadas por horizonte. El esfuerzo es una estimación propia: S = menos de 1 semana, M = 1 a 2 semanas, L = más de 2 semanas, medido a ~30 h por semana. **A las 20 h confirmadas, multiplicá por 1,5.**

### Horizonte 1: cerrar el MVP y salir a cobrar (0 a 6 semanas)

| # | Propuesta | Por qué | Esfuerzo |
| --- | --- | --- | --- |
| 1.1 | **Cerrar el circuito del dinero:** hitos de facturación por etapa, marcar órdenes y etapas como "facturadas" (n.º de comprobante externo, fecha, monto) y "cobradas" (fecha, medio, tipo de cambio). Saldo a cobrar por proyecto y por cliente | Usa el estado `billable` que hoy está muerto; el panel "recuperado" pasa a "recuperado y cobrado" | M |
| 1.2 | **Costo interno por hora** por miembro y vigencia, y **rentabilidad por proyecto y etapa** (honorario ajustado − horas × costo) | Es el 4.º dolor de la propuesta; hoy no se puede medir | S-M |
| 1.3 | **Pruebas punta a punta con Playwright** de los 3 flujos críticos (aprobar por link, publicar una revisión, cargar horas) | Era parte de la "definición de terminado" del plan | S |
| 1.4 | **Observabilidad y seguridad:** Sentry, límite de pedidos en `/aprobar` y `/login`, prueba de restaurar un backup, revisión legal de términos y privacidad | Checklist de lanzamiento | S |
| 1.5 | **Cobro automático del plan** con suscripciones de Mercado Pago, en lugar de `/admin/cobros` manual | Escala sin trabajo manual | M |
| 1.6 | **Carga automática del índice CAC** (y del índice RT 6 de FACPCE para después), con valor provisorio o definitivo | La CAC publica entre el día 19 y el 24; puede rectificar valores [V] | S |

### Horizonte 2: finanzas de obra (el módulo nuevo, fase a)

| # | Propuesta | Se apoya en | Esfuerzo |
| --- | --- | --- | --- |
| 2.1 | **Ficha de obra:** dirección, m², tipología, fechas, comitente, modalidad (ajuste alzado, unidad de medida, coste y costas, administración), moneda e índice del contrato | `projects` | S |
| 2.2 | **Presupuesto y cómputo:** rubro → ítem → unidad × cantidad × precio, con versiones y coeficiente de pase. Importa desde Excel (BC3 más adelante) | — | L |
| 2.3 | **Certificados de avance mensuales:** % por ítem (anterior, del período y acumulado), adicionales que salen de las **órdenes de cambio aprobadas**, ajuste CAC, descuento de anticipo, fondo de reparo y acopio. El comitente **aprueba por link**, igual que una OC | `change_orders`, `price_indices`, `approval_links` | L |
| 2.4 | **Subcontratos y certificados de subcontratistas:** el contratista invitado carga su avance y el director lo aprueba; fondo de reparo retenido | `project_guests` (contractor) | M-L |
| 2.5 | **Compras:** pedido → orden de compra → remito → factura del proveedor (control en tres vías), imputadas a obra e ítem | — | M-L |
| 2.6 | **Tesorería:** cajas y fondos fijos por obra con rendiciones, cuentas bancarias, importación de extractos (CSV), cheques y ECHEQ con estados, órdenes de pago y recibos, cuentas corrientes | — | L |
| 2.7 | **Tablero de obra:** presupuesto vs. real, curva S, margen, flujo de fondos proyectado en ARS y USD, saldo de anticipo y de fondo de reparo | Vistas SQL al estilo de `fee_stage_summary` | M |
| 2.8 | **Carga de comprobantes por QR de ARCA o foto con OCR** (después también por WhatsApp) | Storage + hash | M |

### Horizonte 3: contabilidad de gestión e integraciones (fases b y c)

| # | Propuesta | Esfuerzo |
| --- | --- | --- |
| 3.1 | **Plan de cuentas** (plantilla de constructora y otra de estudio), ejercicios y períodos con cierre | M |
| 3.2 | **Motor de asientos automáticos:** cada certificado, factura, orden de pago o rendición genera su asiento con reglas configurables; no hay edición, solo reversión | L |
| 3.3 | **Libro Diario, Mayor, Sumas y saldos, Situación patrimonial y Resultados "de gestión"** con exportación a Excel y PDF | M |
| 3.4 | **Exportación para el contador:** CSV de asientos compatible con Colppy y una exportación genérica; **API de Xubio** (OAuth2) para comprobantes y asientos | M-L |
| 3.5 | **Factura electrónica (WSFE)**: primero emitir a través de Xubio o Colppy; directo con ARCA solo si lo piden muchos clientes | L |
| 3.6 | **Fideicomisos al costo** como entidad contable propia: fiduciantes, unidades, cuotas ajustadas por CAC, rendición de cuentas | L |

### Horizonte 4: crecimiento

- Selector de varias organizaciones (para el contador o el renderista que trabaja con varios estudios), un módulo simple de tareas, y avisos y aprobaciones por WhatsApp.
- Plan gratis hasta 1 o 2 obras (como Constructora360); "hecho con" en los portales de invitados.
- La segunda etapa ya prevista: unidades, reservas y brokers.

---

## 4. El flujo contable de una constructora, aplicado al producto

### 4.1 El mapa completo

```
Contrato con el comitente (modalidad, índice base, % anticipo, % fondo de reparo)
   │
   ├─► Presupuesto y cómputo (rubros, ítems, análisis de precios)
   │
   ├─► Anticipo financiero cobrado ───────────────┐ (pasivo: anticipo de clientes)
   │                                               │
   ├─► Certificado mensual de avance ◄─ órdenes de cambio aprobadas (adicionales)
   │      bruto + ajuste CAC − descuento de anticipo − fondo de reparo − acopio
   │      → comitente aprueba → factura (ARCA) → recibo / cobro (transferencia, ECHEQ)
   │
   ├─► Costos de obra (centro de costo = obra/ítem)
   │      Compras: pedido → OC → remito → factura del proveedor → orden de pago (con retenciones)
   │      Subcontratos: certificado del subcontratista → fondo de reparo retenido → pago
   │      Mano de obra UOCRA: partes diarios → sueldos → Fondo de Cese Laboral (IERIC)
   │      Caja chica de obra: gasto → rendición → reposición
   │
   ├─► Tesorería: cajas, bancos, cheques/ECHEQ, conciliación, flujo proyectado ARS/USD
   │
   └─► Contabilidad: asiento automático por cada operación → Libro Diario → Mayor
          → Sumas y saldos → ajustes de cierre (amortizaciones, avance, inflación)
          → Estados contables → exportación al contador (libros legales e impuestos)
```

**Este mapa es el del constructor.** Como el módulo se vende a estudios y a constructoras, cada obra tiene que registrar qué papel cumple la empresa, porque cambia quién certifica, qué plata es propia y cómo se registra [I][C]:

| Papel en la obra | Certificados | Plata propia | Plata de terceros |
| --- | --- | --- | --- |
| **Constructor** (contratista principal) | Los emite al comitente y los cobra | El certificado es ingreso | — |
| **Director de obra** | Controla y aprueba u observa los del contratista, en nombre del comitente | Sus honorarios (ya están en `fee_stages`) | No maneja el dinero de la obra |
| **Administrador** (obra por administración) | Recibe fondos del comitente, contrata y paga gremios y materiales en su nombre | Sus honorarios, a menudo un % del costo | **Los fondos del comitente**: pasivo, con rendición de cuentas periódica |

El papel del estudio como director de obra es el que mejor aprovecha lo que ya existe: aprobación por link, contratistas invitados y hash. El de administrador agrega la rendición de cuentas al comitente, que tiene que validarse con un contador [C].

### 4.2 Plan de cuentas típico [I]

| Rubro | Cuentas propias del sector |
| --- | --- |
| Activo corriente | Caja y fondos fijos por obra; Bancos ARS/USD; Valores a depositar (cheques/ECHEQ); Deudores por certificados; **Certificados a facturar** (derechos de facturar, RT 54 [V]); **Fondo de reparo a cobrar**; Anticipos a proveedores y subcontratistas; **Acopios**; Materiales en obra; Obras en curso (si se reconoce a obra terminada); Créditos fiscales (IVA, retenciones y percepciones sufridas, SIRCREB) |
| Activo no corriente | Equipos, rodados, herramientas, obrador; amortizaciones (se imputan a la obra por hora o día de uso) |
| Pasivo | Proveedores; **Subcontratistas**; **Fondo de reparo retenido a subcontratistas**; **Anticipos de clientes / anticipo financiero** (baja con cada certificado [V]); Remuneraciones y cargas (**Fondo de Cese Laboral**); Deudas fiscales; Préstamos; Cheques diferidos emitidos |
| Patrimonio neto | Capital, Ajuste de capital (por inflación), Reservas, Resultados no asignados |
| Ingresos | Ingresos por obra (certificación), por redeterminación o ajuste, por adicionales (OC) |
| Egresos | Costo de obra (materiales, mano de obra, subcontratos, equipos, indirectos); gastos de estructura; resultados financieros y de tenencia, incluido RECPAM [V] |

### 4.3 Ciclo contable y reglas legales

| Paso | Regla | Fuente |
| --- | --- | --- |
| Asiento | Partida doble (Debe = Haber) con respaldo documental | CCyC art. 321 [V] |
| Libro Diario | Cronológico; admite resúmenes de hasta 1 mes; Caja y subdiarios lo integran | CCyC arts. 325 y 327 [V] |
| Mayor y sumas y saldos | Auxiliares de control | [I] |
| Cierre | Amortizaciones, devengamientos, reconocimiento por avance, ajuste por inflación, refundición, apertura del ejercicio siguiente | [I] |
| Estados | Situación patrimonial y Resultados al libro Inventarios y Balances (art. 326); además Evolución del PN y Flujo de efectivo | [V] / [C] |
| Correcciones | "Las equivocaciones y omisiones deben salvarse mediante un nuevo asiento": **nada se edita ni se borra** | CCyC art. 324 [V] |
| Conservación | 10 años | CCyC art. 328 [V] |

### 4.4 Normas que condicionan el diseño

- **RT 54 (Norma Unificada Argentina de Contabilidad)** es obligatoria para ejercicios iniciados desde el 01/01/2025 [V].
  - Los contratos de construcción que se parecen a un servicio continuo reconocen ingresos **a lo largo del plazo (por avance)**; los que se parecen a la venta de un bien, **cuando el cliente obtiene el control** [V].
  - **Diseño:** criterio de reconocimiento **parametrizable por obra**, y avance físico separado del avance certificado [I].
- **Ajuste por inflación (RT 6):** FACPCE sigue publicando el índice en 2026 (julio 2026: variación interanual del 33,8%) [V]. Lo más probable es que siga siendo obligatorio [I][C]. El sistema guarda el índice y deja el cálculo al contador.
- **Libros digitales:** requieren autorización del Registro Público y dictamen de contador. En Córdoba, IPJ RG 57/2020 (PDF por CiDi); para las SAS, PDF firmado y encadenado por SHA-256 [V]. **El sistema no debería presentarse como libro legal.**
- **IVA:** desde noviembre 2025 los responsables inscriptos liquidan con **IVA Simple (F.2051)**, y el Libro IVA Digital quedó para exentos (RG 5707/2025) [V][C]. Construcción de vivienda al 10,5%, general 21% [V].
- **Retenciones:** Ganancias RG 830 (SICORE), IVA RG 2854 (agentes designados), IIBB Córdoba (DGR, RN 1/2021), SIRCREB, impuesto al cheque [V]; las alícuotas vigentes se validan [C]. El sistema **captura y reporta** esos datos, no los liquida.
- **Mano de obra UOCRA:** el Fondo de Cese Laboral es el 12% de la remuneración el primer año y el 8% desde el segundo, depositado dentro de los 15 días; hay que registrarse en el IERIC [V]. Revisar el efecto de la Ley Bases [C].
- **Obra pública en Córdoba:** fondo de reparo del 5% al 10% por certificado, sustituible por póliza (Ley 8614 art. 59); redeterminación por el Decreto 800/16 [V].

### 4.5 Tesorería

- **Fondo fijo por obra:** responsable, tope, rendición con comprobantes y reposición.
- **Bancos por moneda** con importación de extracto y conciliación (partidas pendientes).
- **Cheques y ECHEQ** (BCRA Com. "A" 6578 [V]) con estados: en cartera, depositado, endosado, rechazado, descontado.
- **Órdenes de pago** que aplican comprobantes y registran las retenciones practicadas; **recibos** que aplican cobros.
- **Flujo de fondos proyectado:** certificados a cobrar (netos de anticipo y fondo de reparo), OC comprometidas, sueldos e impuestos.
- **Multimoneda:** importe original, tipo de cambio congelado al registrar e importe en ARS (los registros legales van en moneda nacional, art. 325 [V]); diferencias de cambio.

### 4.6 Fideicomisos al costo (muy comunes en Córdoba)

- **Contabilidad separada por fideicomiso** [V] → en el sistema, una entidad contable por fideicomiso.
- **Fiduciantes y unidades:** % de participación y plan de cuotas en ARS ajustadas por CAC (cuota × índice del mes ÷ índice base).
- **Rendición de cuentas:** al menos una vez al año (CCyC art. 1675, sin dispensa posible) [V].
- **Tratamiento impositivo** a validar [C].

### 4.7 Modelo de datos propuesto (con los nombres en inglés que ya usa el esquema)

Todas las tablas llevan `org_id` + RLS. Importes en `numeric(18,2)`; tipos de cambio y factores en `numeric(18,6)`.

| Dominio | Tablas |
| --- | --- |
| Estructura | `ledgers` (la empresa o cada fideicomiso), `fiscal_years`, `periods` (abierto, cerrado o bloqueado), `exchange_rates`; `price_indices` existente + serie FACPCE y marca de provisorio |
| Contabilidad | `accounts` (código jerárquico, tipo, imputable, `requires_cost_center`), `cost_centers` (enlazado a `projects` y a rubros), `journal_entries` (número, fecha, período, `source_type`/`source_id`, estado, `reverses_id`, `hash`, `prev_hash`), `journal_lines` (cuenta, centro de costo, tercero, debe, haber, moneda, importe original, tipo de cambio), `posting_rules` |
| Terceros | `parties` (CUIT, condición frente al IVA y a IIBB; roles: cliente, proveedor, subcontratista, fiduciante), `party_tax_rates` |
| Comprobantes | `vouchers` (emitidos y recibidos: tipo, punto de venta, número, CAE, moneda, archivo con SHA-256), `voucher_lines`, `voucher_taxes` |
| Obra | `contracts` (modalidad, índice base, rezago, % anticipo, % fondo de reparo, criterio de ingreso), `budgets` / `budget_items`, `progress_certificates` / `certificate_items` / `certificate_deductions`, `subcontracts` + sus certificados, `purchase_orders`, `delivery_notes`, `daily_reports`, `guarantees` (pólizas) |
| Tesorería | `cash_boxes`, `cash_reports` (rendiciones), `bank_accounts`, `bank_movements`, `reconciliations`, `checks` + `check_events`, `payment_orders` + aplicaciones y retenciones, `receipts` + aplicaciones |
| Fideicomiso | `trust_units`, `installment_plans`, `installments` |

### 4.8 Reglas de integridad: el mismo patrón que ya usa el proyecto

| Regla | Implementación |
| --- | --- |
| Asiento balanceado | Constraint trigger `DEFERRABLE INITIALLY DEFERRED` (Σ debe = Σ haber al contabilizar) + `check` por línea (debe xor haber, sin negativos) |
| Inmutable (art. 324) | Un trigger bloquea UPDATE y DELETE de asientos contabilizados; solo se revierte con `reverse_journal_entry()`. Igual que `events` hoy |
| Períodos cerrados | Rechaza asientos con fecha dentro de un período cerrado; reabrir exige ser dueño y queda en `events` |
| Numeración correlativa sin huecos | Tabla de secuencias con `select … for update` al contabilizar. Es el mismo patrón que `create_change_order`, que numera OC-001 bloqueando el proyecto |
| Asientos automáticos | Funciones `post_certificate()`, `post_voucher()`, `post_payment_order()` que generan el asiento con `posting_rules` en la misma transacción |
| Cadena de hash | `hash` = SHA-256(contenido + `prev_hash`), como los libros digitales de las SAS [V]; reutiliza el patrón de `content_hash` |
| Multimoneda | El tipo de cambio queda congelado al contabilizar |

### 4.9 Cómo se enchufa con lo que ya existe

- **Órdenes de cambio aprobadas** → adicionales del certificado y del contrato (ingreso por adicionales).
- **Índices** (`price_indices`) → ajuste CAC de certificados y cuotas; índice RT 6.
- **Horas** (`time_entries`) + costo interno → costo de mano de obra técnica por obra y partes diarios.
- **Invitados contratistas** → portal donde el subcontratista carga su certificado y lo aprueba el director de obra.
- **Links de aprobación con hash** → aprobación de certificados por el comitente.
- **`events` + outbox** → auditoría y avisos (certificado por aprobar, cheque por vencer, período sin cerrar).
- **Exportación Excel** → libros de gestión y archivo para el contador.

### 4.10 Qué construir y qué integrar

| Fase | Alcance | Decisión |
| --- | --- | --- |
| **a. Finanzas de obra** | Contrato, presupuesto, certificados, compras, subcontratos, tesorería, cuentas corrientes, tablero | **Construir:** es el valor diferencial |
| **b. Contabilidad de gestión** | Plan de cuentas, asientos automáticos, Diario, Mayor, Sumas y saldos, estados de gestión, cierres | **Construir**, presentada como "de gestión", no como libros legales |
| **c. Contabilidad legal e impuestos** | Libros rubricados o digitales, ajuste por inflación, IVA Simple, IIBB, SICORE/SIRE, balance firmado, factura electrónica | **Integrar o exportar** (Xubio por API, Colppy por CSV o API, Tango por archivo). La responsabilidad sigue siendo del contador |

### 4.11 Para validar con un contador antes de construir [C]

1. Si el ajuste por inflación es obligatorio en 2026.
2. El criterio de reconocimiento de ingresos por tipo de contrato bajo RT 54.
3. Si IPJ Córdoba acepta un Diario generado por el sistema, y con qué formato.
4. El IVA de anticipos, acopios y fideicomisos.
5. Las alícuotas vigentes de IIBB, RG 830 y RG 2854.
6. El estado del Libro IVA Digital para responsables inscriptos.
7. Los formatos de importación de Xubio, Tango y Holistor.
8. El tratamiento contable e impositivo de cada papel en la obra, en especial los fondos del comitente en obras por administración y la rendición de cuentas.

---

## 5. Decisiones tomadas (19/10/2026)

| Tema | Decisión |
| --- | --- |
| Segmento del módulo nuevo | **Ambos:** estudios que dirigen o administran obra y constructoras pyme, con planes distintos |
| Alcance contable | **Todo, por etapas:** a (finanzas de obra) → b (contabilidad de gestión) → c (integraciones y contabilidad legal vía el contador) |
| Orden | **Arrancar con finanzas de obra.** Lo pendiente del MVP (cobro automático, pruebas punta a punta, legales) se intercala en los sprints |
| Ritmo | **Sprints de 1 semana a 20 h**, con 17 h planificables (15% de reserva) |
| Primera versión (R1) | **Fundaciones + presupuesto + certificados**, en 14 sprints o menos. Se pone en uso con 3 a 5 socios de diseño (al menos una constructora) antes de comprometer la contabilidad (B) y las integraciones (C) |
| Planificación | **Por oleadas:** se detallan los primeros 8 sprints; el resto queda a nivel de épica y se vuelve a planificar en cada compuerta |
| Papel en la obra | Cada obra registra si la empresa es **constructor, director de obra o administrador** (sección 4.1) |
| Features nuevas | **Presupuesto estimado** (materiales + horas de arquitectos, obreros y personal) y **cómputo de materiales asistido** a partir de lo que se carga del proyecto (sección 6) |

---

## 6. Presupuesto estimado y cómputo asistido (features nuevas)

### 6.1 Presupuesto estimado: materiales + mano de obra

Un presupuesto de obra se arma con tres piezas que se multiplican: **cuánto hay que hacer** (cómputo métrico por ítem), **qué consume cada unidad** (análisis de precio unitario o APU, con rendimientos de materiales, horas de mano de obra y equipos) y **cuánto cuesta cada insumo** (lista de precios) [I]. Sobre el costo directo se aplica el **coeficiente de pase** (gastos generales, beneficio, impuestos).

| Pieza | Qué guarda | De dónde salen los datos |
| --- | --- | --- |
| Insumos | Materiales (unidad, precio, proveedor, fecha); categorías de mano de obra; equipos | Lista propia del usuario (importable de Excel o de proveedores) |
| | Escala UOCRA por categoría, a noviembre 2026 en Zona A: ayudante $5.696, medio oficial $6.188, oficial $6.697 y oficial especializado $7.828 por hora [V] | [iProfesional](https://www.iprofesional.com/management/466103-cuanto-gana-un-albanil-en-noviembre-2026-tras-los-acuerdos-de-la-uocra.amp) |
| | Cargas sociales y Fondo de Cese (12% el primer año, 8% después) como coeficiente sobre el jornal | [C] |
| APU / rendimientos | Por ítem (ej. "mampostería de ladrillo hueco 18 cm, m²"): cantidad de cada material por unidad, horas por categoría, desperdicio | Biblioteca base sembrada por el producto y editable por cada empresa. Hay que curarla con un profesional de cómputos local [I][C] |
| Cómputo | Rubro → ítem → cantidad, con la fuente de cada cantidad: manual, paramétrica, IFC o IA | Usuario o cómputo asistido (6.2) |
| Mano de obra técnica | Honorarios del estudio por etapa y horas × costo interno | Ya existe en `fee_stages` y `time_entries`. Falta el costo interno por hora |
| Personal e indirectos | Capataz, sereno, administrativo, obrador, seguros, por mes de obra | Plantilla por tipología |
| Actualización | El presupuesto se re-expresa por índice (CAC general, materiales o mano de obra; ICC Córdoba) | Reutiliza `price_indices` y el ajuste por índice que ya existe |

**La biblioteca es un trabajo de contenido, no de código.** Sin rendimientos cargados y precios al día, el presupuesto es un Excel vacío. No hay una API pública de precios de materiales de libre uso en Argentina [I]. La propuesta es repartirla en cuatro partes:

| Parte | Quién la mantiene | Frecuencia |
| --- | --- | --- |
| Biblioteca base de APU (30 a 60 ítems frecuentes de vivienda y edificio en Córdoba) | El producto, curada una vez con un profesional de cómputos | Revisión anual |
| Precios de materiales | Cada organización (carga o importa sus listas de proveedores) | Cuando cambian |
| Costo de referencia por m² (ICC Córdoba, CAC) | El producto, por índice | Mensual |
| Escala UOCRA | El producto | En cada paritaria |

Falta definir quién hace la curaduría inicial [C].

**Referencias de costo por m² para el nivel paramétrico:**

- El **Índice del Costo de la Construcción de Córdoba** (Dirección General de Estadística y Censos) mide una vivienda social tipo de 50,25 m², con 123 materiales, 6 categorías de mano de obra y 11 ítems varios. A diciembre 2025 marcaba **$823.605,9 por m²** [V] ([La Voz de San Justo](https://www.lavozdesanjusto.com.ar/construir-en-cordoba-el-metro-cuadrado-supero-los-823-mil-en-diciembre)).
- La CAC publica las series de costo total, materiales y mano de obra (ver 4.4).

**El presupuesto acompaña a las etapas del proyecto: tres niveles de precisión [I]**

| Etapa (plantilla actual) | Nivel de presupuesto | Cómo se calcula | Precisión orientativa [I] |
| --- | --- | --- | --- |
| Croquis preliminar | 1. Paramétrico | m² × costo por m² de referencia × coeficiente de tipología y calidad | ± 25-30% |
| Anteproyecto | 2. Por rubros | Rubros con cantidades gruesas (m² de muros, losas, pisos) × APU | ± 15-20% |
| Documentación de proyecto | 3. Por ítem | Cómputo detallado (manual, IFC o asistido) × APU × precios | ± 5-10% |
| Dirección de obra | Presupuesto base del contrato | Congelado como versión contractual; contra él se certifica y se controla lo real | — |

### 6.2 Cómputo de materiales asistido: qué se puede calcular y desde qué archivo

La idea de "cargar el proyecto y que calcule los materiales" es viable, pero **la fuente importa mucho** [I]:

| Lo que se carga | Qué se puede obtener | Confiabilidad | Cómo |
| --- | --- | --- | --- |
| **Modelo BIM (IFC)** desde Revit, ArchiCAD u otros | Cantidades exactas por elemento: m² de muros, m³ de losas, aberturas, por nivel | **Alta** si el exportador incluye los conjuntos de cantidades `Qto_` (por ejemplo `Qto_WallBaseQuantities.NetSideArea`). Algunos exportadores (ciertos de Revit) no los incluyen y hay que calcularlas desde la geometría; una prueba informó ~2% de diferencia en áreas y menos de 1% en volúmenes frente a Revit [V] ([OSArch](https://community.osarch.org/discussion/1346/)) | IfcOpenShell (servidor) o web-ifc (navegador) [I] |
| **Planos en PDF vectorial con escala** | m² por local, metros lineales de muros, cantidad de aberturas, artefactos | **Media.** Contar elementos repetidos y medir áreas con la escala fijada es lo que mejor sale; las láminas escaneadas, las escalas ambiguas y las instalaciones y estructura densas salen peor [V]. Un modelo general sin herramientas dio 65-75% de exactitud en planos [V] ([TechnBrains](https://www.technbrains.com/blog/ai-construction-estimating/)) | IA con visión + escala calibrada por el usuario + revisión humana obligatoria |
| **Renders e imágenes** | **Qué** materiales y terminaciones hay (piso de porcelanato, revestimiento de madera, carpintería de aluminio negro), no **cuánto** | **Baja para cantidades:** la perspectiva no tiene escala y oculta partes [I]. Productos como Handoff ya generan presupuestos de remodelación a partir de fotos y planos, pero sin métricas de exactitud publicadas y con un paso de "revisar y ajustar" [V] ([Handoff](https://handoff.ai/blog/new-ai-agents-generate-estimates-from-drawings-photos-and-more)) | IA con visión → lista de terminaciones sugeridas → el usuario las vincula a ítems del presupuesto |
| **Datos del proyecto** (m², tipología, plantas, calidad) | Presupuesto paramétrico (nivel 1) | Orden de magnitud | Fórmulas, sin IA |

**Mercado:** las herramientas de cómputo con IA (Togal.AI ~USD 299 por usuario por mes, Kreo ~USD 35, Beam AI a cotizar, STACK) **sacan cantidades, pero no ponen precios**: el precio sigue siendo otro proceso [V] ([TechnBrains](https://www.technbrains.com/blog/ai-construction-estimating/)). Ninguna está pensada para Argentina, en pesos y con APU locales [I]. Unir cómputo, APU locales, ajuste CAC y certificados es un hueco real.

**El diferencial que ya tiene el producto [I]:**

- Cada cómputo queda atado a la **revisión exacta** del plano o modelo del que salió, con su SHA-256.
- Al publicarse una revisión nueva, el cómputo y el presupuesto pasan a **"a revisar"**, con el mismo mecanismo que hoy usan las piezas dependientes.
- Nadie presupuesta con un plano viejo: es la frase de venta del producto, aplicada al presupuesto.

**Reglas de diseño:**

- Toda cantidad sugerida por IA queda marcada como **"estimada"**, con su origen y su confianza. Entra al presupuesto solo cuando una persona la confirma.
- El usuario fija la escala.
- Los archivos no se usan para entrenar modelos y el proveedor de IA se declara en la política de privacidad [C].
- Conviene empezar con una **prueba de concepto de 1 sprint** con criterio de sigue o no sigue: medir el error contra un cómputo manual de 2 o 3 proyectos reales de los socios de diseño.

### 6.3 Lo que hay que generalizar del código actual

Reutilizar lo que ya existe no es gratis. Revisado contra el esquema:

| # | Pieza | Limitación actual | Cambio necesario |
| --- | --- | --- | --- |
| G1 | Aprobación por link | `approval_links.change_order_id` es obligatorio: solo sirve para órdenes de cambio (`20261018000000_aprobacion_y_recuperado.sql:12`) | Generalizar a presupuestos y certificados (`subject_type` + `subject_id`, o FK opcionales con `check` de exactamente uno), migrar los links existentes y probar que `/aprobar/[token]` siga igual |
| G2 | "A revisar" | `dependencies` está modelada para archivos: tipos `render`, `sales_plan`, `brochure`, `other`, con formato y tamaño (`20261020000000_piezas_dependientes.sql:6`) | Una dependencia que no sea archivo, para que un presupuesto o un cómputo pase a "a revisar" cuando `publish_revision` reemplaza el plano |
| G3 | Modelos IFC | `revisions` acepta solo PDF, PNG, JPEG y WebP de hasta 50 MB (`20261019000000_documentos_y_revisiones.sql:33`); los modelos suelen pesar más | Definir dónde se guardan (límite de Supabase Storage o Cloudflare R2) y dónde se leen: web-ifc en el navegador, o IfcOpenShell en un servicio aparte (las Edge Functions corren en Deno, no en Python) |

---

## Fuentes

**Competencia:** [Lebane – iProUP](https://www.iproup.com/startups/70296-argentinos-lanzan-ia-para-la-construccion-que-apunta-a-financiar-obras-en-todo-el-pais.amp) · [Lebane – Mercado](https://mercado.com.ar/negocios/lebane-invirtio-us-4-millones-y-sumo-pagos-integrados-para-constructoras) · [Lebane – Capterra](https://www.capterra.com/p/10046484/Lebane/) · [Finnegans constructoras](https://test.finneg.com/en/soluciones/constructoras) · [Finnegans Developers](https://web.finneg.com/en/developers) · [Softland](https://softland.com/ar/constructoras/) · [Bejerman](https://www.thomsonreuters.com.ar/es/soluciones-fiscales-contables-gestion/soluciones-de-gestion-para-pymes/bejerman-erp.html) · [Precios ERP AR 2026](https://app.spomsolutions.com/blog/cuanto-cuesta-erp-argentina-2026) · [Xubio precios](https://xubio.com/ar/precios-empresas) · [Xubio IA](https://xubio.com/ar/comprobantes-ia) · [Xubio API](https://ayuda.xubio.com/es-ar/como-uso-api/) · [Colppy precios](https://colppy.com/planes-y-precios-pymes) · [Colppy API](https://apidocs.colppy.com/) · [Colppy importar asientos](https://intercom.help/Colppy/es/articles/1263069-importar-asientos-contables) · [Alegra – Apideck](https://developers.apideck.com/apis/accounting/alegra) · [Tango API](https://github.com/TangoSoftware/ApiClientes) · [Odoo Forge](https://apps.odoo.com/apps/modules/19.0/forge) · [ADHOC Odoo AR](https://github.com/ingadhoc/odoo-argentina-ce) · [Foco en Obra](https://www.comparasoftware.com/foco-en-obra) · [Constructora360](https://www.constructora360.app/) · [Sage Intacct 08/2026](https://www.sage.com/investors/investor-downloads/press-releases/2026/08/sage-intacct-expands-ai-powered-financial-controls-and-industry-capabilities-for-greater-confidence/) · [Foundation](https://capterra.com/p/2032/FOUNDATION/) · [Premier](https://www.capterra.com/p/133101/Premier/pricing/) · [Knowify](https://projul.com/blog/knowify-pricing-breakdown/) · [Contractor Foreman](https://pricingsaas.com/companies/contractorforeman) · [Buildertrend 09/2026](https://www.newsfilecorp.com/release/316422) · [Open Finance BCRA](https://www.elliberal.com.ar/nota/94159/2026/10/open-finance-en-argentina--el-plan-del-bcra-para-compartir-datos-de-arca-y-potenciar-el-acceso-al-credito) · [RG ARCA 5893/2026](https://www.canal26.com/economia/2026/10/09/arca-cambia-la-facturacion-quienes-deberan-dejar-de-usar-comprobantes-en-papel-y-desde-cuando/)

**Contabilidad y normas:** [RT 54 – CPCE](https://consejo.org.ar/micrositios-profesionales/rt-54-norma-unificada-argentina-de-contabilidad) · [Guía RT 54 CPCE](https://www.consejo.org.ar/storage/attachments/GUIA%20DE%20PREGUNTAS%20Y%20RESPUESTAS.pdf-Er92AK1Btg.pdf) · [RT 54 comentada – UCSE](https://www.ucse.edu.ar/wp-content/uploads/2023/12/SALOMON-Julio-B-RT.-54-FACPCE-actualizada-con-RT-56-FACPCE-Norma-Unificada-Argentina-de-Contabilidad-Primera-Parte.pdf) · [JG 660/26](https://siap.blogdelcontador.com.ar/?p=82970) · [Índices RT 6 julio 2026](https://contadoresenred.com/ajuste-por-inflacion-contable-e-impositivo-indices-julio-2026/amp/) · [Registros contables CCyC – CPCE Santa Fe](https://www.cpcesfe2.org.ar/wp-content/uploads/2019/03/4306-Registros_Contables.pdf) · [Libros digitales](https://blogdelcontador.com.ar/news-46431-libros-contables-sin-rubrica-que-permite-la-ley-para-usar-soportes-digitales-y-electronicos) · [Manual libros digitales SAS](https://www.argentina.gob.ar/sites/default/files/manual_de_libros_digitales.pdf) · [IPJ Córdoba RG 57/2020](https://ipj.cba.gov.ar/wp-content/uploads/2021/01/RES57G2020.pdf) · [RG 5707/2025](https://www.boletinoficial.gob.ar/detalleAviso/primera/326299/1) · [IVA Simple – Marval](https://www.marval.com/Publicacion/arca-implementa-el-iva-simple-17215?lang=es) · [IVA vivienda – ARCA](https://servicioscf.afip.gob.ar/publico/abc/consultas_detalle.aspx?id=547266) · [IVA en construcción](https://reprodigital.com.ar/nota/1109/iva_en_la_construccion_como_se_calcula_en_obras_sobre_inmueble_propio) · [RG 830](https://yo-facturo.com/blog/rg-830-afip-actualizada-retenciones/) · [RG 2854](https://siap.blogdelcontador.com.ar/normativa/resolucion-general-afip-2854-2010/) · [IIBB Córdoba](https://yo-facturo.com/ingresos-brutos/cordoba/) · [RN 1/2021 Córdoba](https://contadoresenred.com/wp-content/uploads/2021/11/resolucion_normativa_n1_2021.pdf) · [WSFE ARCA](https://www.arca.gob.ar/fe/ayuda/webservice.asp) · [ECHEQ A 6578](https://blogdelcontador.com.ar/comunicacion-a-6578-bcra-simplificacion-y-desburocratizacion-cheque-electronico-reglamentacion/) · [UOCRA / Fondo de Cese](https://estudiovilaplana.com.ar/trabajadoresconstruccion/) · [Ley 8614 – fondo de reparo](https://ar.vlex.com/vid/resolucion-n-242-1-907724659) · [Redeterminación Córdoba](https://ar.vlex.com/vid/resolucion-n-165-1-735503833) · [Anticipo y acopio – CPAU](https://mepau.cpau.org/Media/Default/pdf/anexos/A-450.pdf) · [Índice CAC](https://mudafy.com.ar/d/indice-cac) · [Deberes contables del fiduciario – UCA](https://repositorio.uca.edu.ar/bitstream/123456789/20510/1/deberes-contables-fiduciario.pdf)

**Presupuesto y cómputo:** [ICC Córdoba – La Voz de San Justo](https://www.lavozdesanjusto.com.ar/construir-en-cordoba-el-metro-cuadrado-supero-los-823-mil-en-diciembre) · [UOCRA noviembre 2026 – iProfesional](https://www.iprofesional.com/management/466103-cuanto-gana-un-albanil-en-noviembre-2026-tras-los-acuerdos-de-la-uocra.amp) · [Cómputo con IA en 2026 – TechnBrains](https://www.technbrains.com/blog/ai-construction-estimating/) · [Handoff: presupuestos desde fotos y planos](https://handoff.ai/blog/new-ai-agents-generate-estimates-from-drawings-photos-and-more) · [Cantidades desde IFC – OSArch](https://community.osarch.org/discussion/1346/)
