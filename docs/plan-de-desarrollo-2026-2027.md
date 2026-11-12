# Plan de desarrollo · noviembre 2026 a marzo 2027

Actualizado: 12/11/2026 · Para: Francisco y la IA que siga el trabajo

Este plan ordena lo que falta para que RP Digital BackOffice tenga una función real y se pueda vender a estudios y constructoras. No reemplaza a [`plan-sprints-finanzas-de-obra.md`](plan-sprints-finanzas-de-obra.md): ese documento tiene los criterios de aceptación, las tablas y las pruebas de cada sprint de Finanzas de obra, y acá se los nombra por número. Lo que este plan cambia es **el orden y el calendario**, y suma tres cosas que el otro no tenía: una **interfaz nueva**, el **trabajo para tener socios** y las **piezas para que una empresa se active sola**.

**Marcas:** **[I]** inferencia o criterio propio · **[C]** validar con un profesional antes del sprint que lo usa · **[F]** decisión de Francisco.

---

## 1. Dónde estamos

### Hecho y en `main` (12/11/2026)

| Bloque | Qué quedó andando |
| --- | --- |
| MVP para estudios (sprints 0 a 5) | Proyectos, honorarios por etapa, horas, índices, órdenes de cambio aprobadas por link, planos y revisiones, piezas dependientes, envíos, comentarios, vencimientos, Excel, planes con prueba de 30 días |
| Finanzas de obra 1 | Ficha de obra y estimación paramétrica |
| Finanzas de obra 2 | Series de referencia (CAC, ICC Córdoba, UOCRA, FACPCE), tipo de cambio, Playwright en CI |
| Finanzas de obra 3 | Costo por hora, rentabilidad por etapa, terceros con CUIT |
| Revisión | Vistas de resumen, consultas acotadas, errores junto al campo |
| Finanzas de obra 4 | Biblioteca de insumos, historial de precios, importación desde Excel, mano de obra atada a UOCRA |
| Finanzas de obra 5 | Análisis de precios (APU) y catálogo de la plataforma |
| Finanzas de obra 6 | Presupuesto por ítem y por rubros, con desglose y tipo de cambio |

Pruebas: 504 de base (pgTAP), 136 de lógica (Vitest), 8 de punta a punta (Playwright). El CI corre las tres.

### Lo que falta, en cuatro grupos

1. **La interfaz no convence.** Hay que elegir otra dirección antes de seguir sumando pantallas: todo lo que se construya después se construye una sola vez.
2. **El presupuesto no termina en un precio.** Falta sumar indirectos, honorarios y pase (sprint 7), poder congelarlo, compararlo y sacarlo en PDF (sprint 8), y mandarlo al comitente (sprints 9 y 10).
3. **No hay ciclo de obra.** Contrato, anticipo, certificado de avance y ajuste CAC (sprints 11 a 13) son lo que una constructora o un director de obra pagaría todos los meses.
4. **Una empresa no se puede activar sola.** Finanzas de obra se prende por SQL, no hay planes de constructora, los límites de cada plan no se controlan y no hay un entorno en la nube para que alguien lo pruebe.

Y una cosa que no es código: **no hay socios de diseño**. Sin al menos una persona armando un presupuesto real, no se sabe si el editor sirve.

---

## 2. Decisiones de partida

| # | Decisión | Por qué |
| --- | --- | --- |
| 1 | **No se lanza todavía.** El lanzamiento (dominio, cobro, términos revisados) queda para cuando haya socios usando el producto | Pedido de Francisco: no hay clientes para esto todavía |
| 2 | **La interfaz nueva va primero**, antes del sprint 7 | Quedan 9 sprints de pantallas nuevas; hacerlas con la interfaz vieja es hacerlas dos veces |
| 3 | **El orden de Finanzas de obra se mantiene** (7 → 14), con el PDF del presupuesto adelantado al sprint 8 | Es lo primero que va a pedir cualquiera que lo pruebe |
| 4 | **Se prepara un entorno de prueba en la nube** (no público) antes de buscar socios | Un socio no puede probar algo que solo corre en tu computadora |
| 5 | **Las validaciones externas se hacen en bloque**, una reunión con el contador y otra con un profesional de cómputos | Hoy bloquean los sprints 7, 11, 12 y 13, y los coeficientes y rendimientos son inventados |
| 6 | **La rama de animaciones no se mergea tal cual.** Sus componentes de movimiento se reutilizan dentro del sistema de diseño nuevo | Está hecha sobre la interfaz vieja y choca con `main` en tres archivos; el spec de movimiento no depende de colores |

---

## 3. Etapa 0 · Interfaz nueva (4 sprints)

### 3.1 Qué cambia sea cual sea la dirección

Esto sale del diagnóstico de [`traspaso-ui-liquid-y-mercado-inmobiliario.md`](traspaso-ui-liquid-y-mercado-inmobiliario.md) §2 y de lo que se vio construyendo los sprints 1 a 6:

| Problema de hoy | Cambio |
| --- | --- |
| Crear y editar se hace abriendo `<details>` en el lugar: empuja el contenido y se ve utilitario | **Paneles laterales** (drawer) para crear y editar, y **diálogos** para confirmar. Los formularios largos (ítem de presupuesto, insumo, tercero) van en panel |
| La página del proyecto es un scroll largo de 9 tarjetas | **Subnavegación del proyecto**: Resumen, Honorarios, Órdenes, Documentos, Obra, Presupuestos, Actividad. Cada una es su ruta |
| Componentes como clases CSS sueltas (`.card`, `.btn`) y radios sin sistema | **Sistema de diseño en componentes de React** (`Button`, `Field`, `Table`, `Card`, `Tabs`, `Drawer`, `Dialog`, `Toast`, `EmptyState`, `Money`), con una escala de radios, espacios y sombras |
| 10 íconos dibujados a mano | **Una librería de íconos** (Lucide, MIT) [I] |
| Sin avisos flotantes ni atajos | **Avisos** (toast) para confirmar acciones y **paleta de comandos** (⌘K) para ir a un proyecto, un insumo o un análisis |
| Modo oscuro solo según el sistema | **Selector de tema** claro, oscuro y automático |
| Tablas que en el teléfono se desplazan de costado | **Tablas que se vuelven tarjetas** en el teléfono en las pantallas que se consultan en obra |
| Sin movimiento | El spec de animaciones (`SPEC-animaciones.md`) aplicado sobre el sistema nuevo: entrada de página, conteo de números, barras que crecen |

### 3.2 Tres direcciones para elegir [F]

Las tres resuelven lo de arriba; cambian el carácter. En el sprint UI-1 se maquetan **las mismas tres pantallas** en cada dirección (proyecto, editor de presupuesto e insumos, en escritorio y teléfono) para elegir viéndolas, no leyéndolas.

| | A · «Planilla clara» | B · «Tablero de obra» | C · «Estudio editorial» |
| --- | --- | --- | --- |
| Inspiración | Linear, Attio, Airtable | Procore, Fieldwire, Mercado Pago | Revistas de arquitectura, Notion, Are.na |
| Carácter | Herramienta de trabajo: densa, precisa, rápida | Panel de control: números grandes y estados a la vista | Marca propia: mucho aire, tipografía con carácter |
| Fondo y color | Blanco y grises neutros, un acento azul índigo | Gris claro con tarjetas blancas; colores de estado fuertes (verde, ámbar, rojo) | Blanco hueso y negro, un acento terracota |
| Tipografía | Inter para todo, mono para importes | Inter con cifras grandes en los resúmenes | Serif para títulos (por ejemplo, Fraunces), sans para el resto, mono para importes |
| Navegación | Barra lateral angosta con íconos y ⌘K | Barra lateral en escritorio y **barra inferior en el teléfono** | Barra superior con secciones y menú lateral plegable |
| Pensada para | Quien pasa el día cargando presupuestos y precios | La constructora y el director que consultan desde la obra | El estudio que quiere que el producto se sienta de arquitectura |
| Riesgo | Se parece a muchas herramientas: poca identidad | Puede verse recargada en pantallas de tablas | Menos densidad: entran menos filas por pantalla |

Si ninguna convence, la dirección «papel y vidrio» del traspaso sigue disponible como cuarta opción.

### 3.3 Sprints de la etapa 0

| Sprint | Semana | Horas | Qué queda hecho |
| --- | --- | --- | --- |
| **UI-1** | 16/11 – 20/11 | 17 | Maquetas de las tres direcciones (3 pantallas × 2 tamaños) publicadas para verlas. **Francisco elige** [F] |
| **UI-2** | 23/11 – 27/11 | 14 (lunes 23 feriado) | Sistema de diseño: tokens (color, tipografía, radios, espacios, sombras, movimiento), componentes base, íconos, tema claro y oscuro con selector. Página interna `/sistema` con todos los componentes. Shell nuevo: navegación, encabezado, ⌘K |
| **UI-3** | 30/11 – 4/12 | 17 | Pantallas del MVP con el sistema nuevo: proyectos, proyecto con subnavegación, honorarios, órdenes, documentos, horas, vencimientos, recuperado, equipo, plan. `<details>` reemplazados por paneles y diálogos |
| **UI-4** | 7/12 – 11/12 | 14 (martes 8 feriado) | Pantallas de Finanzas de obra: obras, ficha, presupuestos y editor, insumos, análisis de precios, terceros, índices, admin. Animaciones del spec. Prueba de punta a punta que recorre todas las pantallas sin errores |

**Listo cuando:** ninguna pantalla usa las clases viejas (`.card`, `.btn`); las 8 pruebas de Playwright siguen en verde, con los selectores actualizados; ninguna pantalla se desborda a 390 px; foco visible con teclado y contraste AA.

**Recorte si hay atraso:** la paleta de comandos y las tablas convertidas en tarjetas en el teléfono pasan a la etapa 3.

---

## 4. Etapa 1 · El presupuesto termina en un precio (2 sprints)

| Sprint | Semana | Horas | Qué queda hecho | Detalle |
| --- | --- | --- | --- | --- |
| **7** | 14/12 – 18/12 | 17 | Indirectos por mes de obra (capataz, sereno, obrador, seguros), honorarios de arquitectos (desde las etapas o por horas × costo interno) y coeficiente de pase (gastos generales, beneficio, impuestos, en cascada o sobre el costo). Resumen: materiales, mano de obra, personal e indirectos, honorarios, pase, precio sin IVA y por m² | Plan F, sprint 7 |
| **8** | 21/12 – 24/12 | 14 | Versiones congeladas (al pasar de borrador, el presupuesto guarda sus montos y deja de seguir los precios), comparación entre versiones, ajuste de una versión por índice, **vista imprimible y PDF** del presupuesto, Excel | Plan F, sprint 8 + PDF adelantado |
| — | 28/12 – 1/1 | 0 | **Vacaciones o reserva** [F] | Pregunta abierta del plan F |

**Antes del sprint 7:** la reunión con el contador (§7). Si no llega, el pase se hace configurable con los dos métodos y la cascada por defecto, y los impuestos quedan como un porcentaje libre marcado «a validar».

---

## 5. Etapa 2 · Aprobación y ciclo de obra (6 sprints)

Es el cierre de R1 del plan F, sin cambios de alcance.

| Sprint | Semana | Horas | Qué queda hecho |
| --- | --- | --- | --- |
| **9** | 4/1 – 8/1 | 17 | **G1:** la aprobación por link sirve para cualquier documento (`subject_type` + `subject_id`), con las pruebas de regresión de órdenes de cambio en verde |
| **10** | 11/1 – 15/1 | 17 | Enviar el presupuesto al comitente y aprobarlo desde el teléfono; la versión aprobada queda **contractual** y congelada con su huella |
| **11** | 18/1 – 22/1 | 17 | Contrato: modalidad, serie y período base del ajuste, rezago, anticipo y fondo de reparo. Registro del anticipo cobrado |
| **12** | 25/1 – 29/1 | 17 | Certificado de avance por ítem (anterior, del período, acumulado, tope 100 %) y adicionales de obra aprobados (G4) |
| **13** | 1/2 – 5/2 | 17 | Ajuste CAC con rezago, descuento del anticipo, fondo de reparo y neto a facturar. Aprobación del comitente por link. Flujo del director de obra |
| **14** | 8/2 – 12/2 | 10 (carnaval) | Cierre de R1: facturado y cobrado informativos, Excel del certificado, revisión de rendimiento y de RLS, Playwright del ciclo completo |

**Antes del sprint 11:** la reunión con el contador (anticipo, fondo de reparo, IVA en el certificado, diferencias entre constructor, director y administrador) y la consulta al abogado sobre el valor de la aprobación por link.

---

## 6. Etapa 3 · Lista para que alguien la use (4 sprints)

Todo lo que hace falta para darle acceso a un socio sin tocar la base a mano. **No es el lanzamiento**: el entorno es privado y por invitación.

| Sprint | Semana | Horas | Qué queda hecho |
| --- | --- | --- | --- |
| **15** | 15/2 – 19/2 | 17 | **Entorno de prueba en la nube:** Supabase (São Paulo) y Vercel con una URL de Vercel, sin dominio propio. Migraciones por CI, copias de seguridad diarias y una restauración probada |
| **16** | 22/2 – 26/2 | 17 | **Operación:** registro de errores (Sentry), páginas de error propias, alerta si el outbox falla, límites de pedidos en `/login` y `/aprobar`, registro de uso por organización (para medir la compuerta) |
| **17** | 1/3 – 5/3 | 17 | **Autoservicio:** planes de constructora (Estudio Obra, Constructora), Finanzas de obra activada por plan y no por SQL, límites de usuarios y obras de cada plan controlados por la base, alta guiada de una constructora (tipo de organización, ficha de la primera obra, cargas, primeros insumos) |
| **18** | 8/3 – 12/3 | 17 | **Datos de precios:** catálogo de precios de referencia de materiales con el relevamiento de la otra sesión (canasta de 30 SKU, factor a la unidad de cómputo), vinculable a los insumos como la escala UOCRA. Recordatorio mensual para cargar las series. Guía de puesta en marcha para socios |

**Antes del sprint 18:** confirmar con el abogado que guardar precios de Easy, Blaisten o Prestigio para el presupuesto interno de un cliente no es republicar su catálogo [C]. Si no se puede, el catálogo queda solo con cotizaciones cargadas a mano y las series públicas (INDEC, CAC).

---

## 7. Trabajo que no es código (en paralelo)

### 7.1 Socios de diseño

**Meta: 3 socios activos antes del sprint 15** (al menos uno que dirija obra y una constructora chica), para que el sprint 15 les dé acceso.

| Cuándo | Qué | Con qué |
| --- | --- | --- |
| Noviembre | Lista de 20 candidatos: estudios conocidos que dirigen obra y constructoras de 5 a 30 personas de Córdoba | Contactos propios, Colegio de Arquitectos, CAC delegación Córdoba |
| Noviembre y diciembre | 8 entrevistas sin mostrar nada | [`guia-entrevistas.md`](guia-entrevistas.md) + bloque de obra del traspaso §5.7 |
| Enero | Demo con las maquetas de la interfaz nueva y el presupuesto por ítem | Entorno local o grabación |
| Febrero | 3 socios con compromiso: cargar una obra real a cambio de uso gratis hasta el lanzamiento | Acuerdo simple por escrito |

### 7.2 Validaciones externas

En dos reuniones, con todas las preguntas juntas. La lista completa está en el plan F §6.

| Con quién | Antes de | Qué se valida |
| --- | --- | --- |
| **Contador** | Sprint 7 (11/12) | Zona UOCRA de Córdoba · cargas sociales y Fondo de Cese · qué impuestos van en el pase y si es en cascada · anticipo, fondo de reparo e IVA en el certificado · diferencias entre constructor, director y administrador · criterio de reconocimiento de ingresos |
| **Profesional de cómputos** | Sprint 8 (18/12) | Coeficientes del paramétrico · factor de semicubiertos · plantilla de rubros y de indirectos · los primeros 10 a 30 ítems del catálogo de análisis (hoy son ejemplos inventados) |
| **Abogado** | Sprint 10 (8/1) | Valor de la aprobación por link de presupuestos y certificados · texto que ve el comitente · uso de precios de terceros (sprint 18) · términos y privacidad (para la etapa 4) |

### 7.3 Datos

- **Series de referencia:** cargar CAC, ICC Córdoba y UOCRA reales desde `/admin/series` todos los meses desde diciembre, para que el entorno de prueba tenga datos verdaderos.
- **Catálogo de análisis:** reemplazar los 4 ejemplos por los ítems validados por el profesional de cómputos.

---

## 8. Etapa 4 · Lanzamiento (cuando haya socios)

No tiene fecha: arranca cuando se cumple la compuerta de la §9. Es el checklist de [`plan-desarrollo-mvp.md`](plan-desarrollo-mvp.md) §10, más lo que sumó Finanzas de obra:

- Dominio propio, correos con Resend verificados, plantillas en español.
- Términos y privacidad revisados por el abogado.
- Cobro: primero por transferencia con factura (definido con el contador), después suscripciones de Mercado Pago.
- Página de producto con los planes de estudio y de constructora y el precio fundador.
- Socios de diseño pasados a cuenta paga o con fecha de pase.

Después siguen las oleadas del plan F §4 (comprobantes y QR de ARCA, compras y subcontratos, tesorería, cómputo asistido, contabilidad), que se revisan con lo que pidan los socios.

---

## 9. Compuertas

| Compuerta | Cuándo | Sigue si | Si no |
| --- | --- | --- | --- |
| **Interfaz** | Fin de UI-1 (20/11) | Francisco elige una dirección | Se itera una semana más con la dirección más cercana; no se empieza UI-2 sin elección |
| **Presupuesto completo** | Fin del sprint 8 (24/12) | Un presupuesto de Edificio Alba con datos validados por el profesional sale en PDF con precio por m² | Se usan los recortes del plan F §8 |
| **Socios** | Antes del sprint 15 (12/2) | 3 socios comprometidos, al menos 1 constructora | El sprint 15 sigue, pero los sprints 17 y 18 se cambian por más entrevistas y ajustes del flujo de estudio |
| **R1 en uso** | 4 semanas después del sprint 15 | 2 socios con un presupuesto real por ítem armado en menos de 3 horas, y 1 certificado aprobado por link | Se corrige con lo que digan, antes de sumar funciones |
| **Lanzamiento** | Cuando se cumpla la anterior | 2 socios dicen que pagarían su plan a ese precio | Se revisan precio y foco (estudios o constructoras) |

---

## 10. Calendario

| Semana | Sprint | Horas | Etapa |
| --- | --- | --- | --- |
| 16/11 – 20/11 | UI-1 · Tres direcciones de interfaz | 17 | 0 |
| 23/11 – 27/11 | UI-2 · Sistema de diseño y shell | 14 | 0 |
| 30/11 – 4/12 | UI-3 · Pantallas del MVP | 17 | 0 |
| 7/12 – 11/12 | UI-4 · Pantallas de Finanzas de obra | 14 | 0 |
| 14/12 – 18/12 | 7 · Indirectos, honorarios y pase | 17 | 1 |
| 21/12 – 24/12 | 8 · Versiones, comparación, PDF y Excel | 14 | 1 |
| 28/12 – 1/1 | Vacaciones o reserva | 0 | — |
| 4/1 – 8/1 | 9 · Aprobación por link generalizada (G1) | 17 | 2 |
| 11/1 – 15/1 | 10 · Presupuesto aprobado por el comitente | 17 | 2 |
| 18/1 – 22/1 | 11 · Contrato y anticipo | 17 | 2 |
| 25/1 – 29/1 | 12 · Certificado de avance y adicionales de obra | 17 | 2 |
| 1/2 – 5/2 | 13 · Ajuste CAC, descuentos y flujo del director | 17 | 2 |
| 8/2 – 12/2 | 14 · Cierre de R1 (lunes 8 y martes 9, carnaval) | 10 | 2 |
| 15/2 – 19/2 | 15 · Entorno de prueba en la nube | 17 | 3 |
| 22/2 – 26/2 | 16 · Operación y monitoreo | 17 | 3 |
| 1/3 – 5/3 | 17 · Autoservicio y planes de constructora | 17 | 3 |
| 8/3 – 12/3 | 18 · Precios de referencia y guía para socios | 17 | 3 |

**Total:** 16 sprints y una semana de reserva, unas 255 horas, del 16/11/2026 al 12/3/2027.

---

## 11. Riesgos

| Riesgo | Señal | Qué se hace |
| --- | --- | --- |
| La interfaz nueva se come más de 4 sprints | UI-3 sin terminar el 4/12 | Las pantallas de admin y las menos usadas pasan con un ajuste mínimo de estilos; se sigue con el sprint 7 |
| Ninguna dirección de interfaz convence | Sin elección al 20/11 | Una semana más con la más cercana, mezclando lo que gustó de las otras |
| No aparecen socios | Menos de 8 entrevistas al 31/12 | Se adelanta el entorno en la nube (sprint 15) para poder mostrar algo real, y se pide ayuda a un contador o al Colegio para llegar a constructoras |
| El contador no está antes del sprint 7 | Sin fecha de reunión al 4/12 | Pase configurable con valores marcados «a validar»; el sprint 11 no arranca sin la reunión |
| Dispersión: pedidos fuera del plan | Pedidos nuevos en cada demo | Lista «después» revisada en cada compuerta |
| Una sola persona a 17 horas por semana | Dos sprints seguidos con más del 20 % sin terminar | Recortes del plan F §8 y de la etapa 0; nunca correr la fecha en silencio |

---

## 12. Decisiones que necesito de Francisco

1. **Qué no te gusta de la interfaz de hoy** (colores, densidad, tipografía, navegación, la página larga del proyecto) y si alguna de las tres direcciones va bien encaminada. Con eso armo las maquetas de UI-1.
2. **Vacaciones:** si la semana del 28/12 es descanso o reserva.
3. **Socios:** si tenés contactos de estudios que dirigen obra o de constructoras para la lista de candidatos.
4. **Profesionales:** si ya hay un contador, un profesional de cómputos y un abogado con quienes hacer las tres consultas.
