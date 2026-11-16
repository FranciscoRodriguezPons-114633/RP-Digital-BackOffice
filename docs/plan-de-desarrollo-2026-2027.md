# Plan de desarrollo · noviembre 2026 a febrero 2027

Actualizado: 16/11/2026 · Para: Francisco y la IA que siga el trabajo

Este plan ordena lo que falta para que RP Digital BackOffice tenga una función real y se pueda vender a estudios y constructoras. No reemplaza a [`plan-sprints-finanzas-de-obra.md`](plan-sprints-finanzas-de-obra.md): ese documento tiene los criterios de aceptación, las tablas y las pruebas de cada sprint de Finanzas de obra, y acá se los nombra por número. Lo que este plan cambia es **el orden y el calendario**, y suma lo que el otro no tenía: la **interfaz nueva**, el **trabajo para tener socios**, las **piezas para que una empresa se active sola** y, desde el 16/11, los **diferenciales frente al mercado**.

**Versión del 16/11/2026:** Francisco adoptó el plan del doc [RP Digital BackOffice: diferenciales y plan de desarrollo](https://claude.ai/artifact/GBzUYkk6S4ay1Hh6PrvSvj) (privado). Las etapas 0 y 1 terminaron unas cinco semanas antes de lo previsto, así que el entorno en la nube pasa al principio y se suman cinco diferenciales (§3). El calendario termina el 12/2/2027, un mes antes que la versión del 12/11.

**Marcas:** **[I]** inferencia o criterio propio · **[C]** validar con un profesional antes del sprint que lo usa · **[F]** decisión de Francisco.

---

## 1. Dónde estamos

### Hecho (16/11/2026)

| Bloque | Qué quedó andando |
| --- | --- |
| MVP para estudios (sprints 0 a 5) | Proyectos, honorarios por etapa, horas, índices, órdenes de cambio aprobadas por link, planos y revisiones, piezas dependientes, envíos, comentarios, vencimientos, Excel, planes con prueba de 30 días |
| Finanzas de obra 1 a 6 | Ficha de obra, paramétrico, series de referencia (CAC, ICC Córdoba, UOCRA, FACPCE), tipo de cambio, costo por hora y rentabilidad, terceros con CUIT, insumos, análisis de precios, presupuesto por ítem y por rubros |
| Interfaz «Tablero de obra» (UI-1 a UI-4) | Sistema de diseño, tema claro y oscuro, ⌘K, proyecto en pestañas con Resumen, pantallas de obra, paneles laterales para crear y editar, movimiento |
| Finanzas de obra 7 | Indirectos, honorarios y pase: el presupuesto termina en un precio sin IVA y por m² |
| Finanzas de obra 8 | Versiones congeladas, comparación, ajuste por índice (también del paramétrico), vista imprimible y PDF, Excel |

Pruebas: 563 de base (pgTAP), 147 de lógica (Vitest), 9 recorridos de punta a punta (Playwright). El CI corre las tres.

### Lo que falta, en cuatro grupos

1. **Nadie lo puede probar.** No hay entorno en la nube, ni socios de diseño, ni usuarios.
2. **No hay ciclo de obra.** Aprobar el presupuesto, contrato, anticipo, certificado de avance y ajuste CAC (sprints 9 a 14) son lo que una constructora o un director de obra pagaría todos los meses.
3. **No hay consulta en obra.** Lo vigente vive en la oficina: no hay QR, ni visor pensado para el celular, ni «visto por». El portal MAILANTARKI ya lo resuelve con el mismo stack.
4. **Una empresa no se puede activar sola.** Finanzas de obra se prende por SQL, no hay planes de constructora y los límites de cada plan no se controlan.

Y lo que no es código: **no hay socios de diseño** y los coeficientes, rendimientos e impuestos siguen sin validar.

---

## 2. Decisiones de partida

| # | Decisión | Por qué |
| --- | --- | --- |
| 1 | **No se lanza todavía.** El lanzamiento (dominio, cobro, términos revisados) queda para cuando haya socios usando el producto | Pedido de Francisco: no hay clientes para esto todavía |
| 2 | **El orden de Finanzas de obra se mantiene** (9 → 14) | Es el ciclo que cierra R1 |
| 3 | **El entorno de prueba en la nube va primero (N1, semana del 23/11)** y no en febrero | Vamos cinco semanas adelantados y no hay socios: un socio no puede probar algo que corre en una sola computadora (16/11) |
| 4 | **El producto se posiciona como «el que prueba la plata»**, no como un software de obra al estilo Fieldwire | Fieldwire gana en todo lo que pasa sobre el plano; nadie une aprobación con prueba, índices argentinos y certificado para equipos de 2 a 30 personas (16/11) |
| 5 | **Se suman cinco diferenciales** (§3): tres van dentro de los sprints 9, 10, 13 y 14 y dos tienen sprint propio (N2 y N3) | Se apoyan en lo que ya existe y cuestan poco frente a lo que diferencian (16/11) |
| 6 | **Las validaciones externas se hacen en bloque y se adelantan:** abogado antes del 7/12, contador antes del 14/12 | Bloquean los sprints 10 y 11 en el calendario nuevo |
| 7 | **No se copia el alcance de Fieldwire:** ni visor BIM, ni RFIs y submittals, ni Gantt, ni formularios a medida, ni apps nativas sin conexión | Cuestan meses y al cliente de 2 a 30 personas le importan poco |

---

## 3. Los cinco diferenciales

El detalle, el mapa de impacto y esfuerzo y la comparación con el mercado están en el [doc del 16/11](https://claude.ai/artifact/GBzUYkk6S4ay1Hh6PrvSvj).

| # | Diferencial | Qué hace | Dónde entra |
| --- | --- | --- | --- |
| 1 | Aprobación con prueba en todo el ciclo | Presupuesto, adicional de obra y certificado se aprueban por link, sin cuenta y con huella | Sprints 9, 10 y 13 |
| 2 | Certificado de obra | Avance por ítem, adicionales, ajuste CAC con rezago, anticipo, fondo de reparo y neto a facturar | Sprints 11 a 13 |
| 3 | La cuenta a la vista | Cada monto ajustado muestra serie, mes base, valor base, valor actual, factor y la cuenta, también en el link y en el PDF | Sprints 9 y 13 |
| 4 | Expediente de evidencia | Un ZIP por obra con un PDF índice: cada aprobación, envío con su apertura, revisión vigente a cada fecha e índice usado | Sprint 14 |
| 5 | Lo vigente en obra | QR y link fijo por plano que abren la revisión vigente, visor en el celular con sello de superado, «visto por» por revisión | Sprint N2 |

Lo acompañan el **portal del comitente** (sprint N3) y los **precios de referencia de Córdoba** (sprint 18).

**Piezas del portal MAILANTARKI:** el link fijo, el QR, el visor y el ZIP se portan desde `/Users/franciscorodriguezpons/dev/portal-documentacion-tecnica` en vez de escribirlos de nuevo. El portal decide permisos en `authorize.ts` y usa la service role; el BackOffice decide en la base (RLS y funciones) y la app no usa la service role. Lo que se porte se adapta a eso.

---

## 4. Etapas terminadas

### Etapa 0 · Interfaz nueva (terminada el 15/11/2026)

**Decisión (15/11/2026): B · «Tablero de obra».** Las maquetas de las tres direcciones están en el lienzo [Direcciones de interfaz](https://claude.ai/artifact/5QtqgE1wXuVVbcX4Lt29L8) (privado).

| Sprint | Qué quedó hecho |
| --- | --- |
| UI-1 | Maquetas de las tres direcciones; Francisco eligió B |
| UI-2 | Tokens, tema claro y oscuro con selector, Inter con cifras tabulares, íconos Lucide, componentes base (`src/components/ui/`), shell con barra lateral y, en el teléfono, barra superior, barra inferior y hoja «Más», buscador ⌘K. Todo se ve en `/sistema` |
| UI-3 | Proyecto en pestañas (Resumen, Honorarios, Órdenes, Documentos, Obra, Presupuestos, Invitados, Actividad), cada una en su ruta |
| UI-4 | Pantallas de Finanzas de obra, movimiento del spec de animaciones y recorrido de punta a punta por todas las pantallas |
| Paneles | Los `<details>` de crear y editar pasaron a paneles laterales con aviso al guardar. Quedan como `<details>` a propósito los capítulos del editor de presupuesto, los comentarios y el historial de costos del equipo |

Queda pendiente, sin sprint: la transición entre páginas y la píldora que se desplaza en la navegación.

### Etapa 1 · El presupuesto termina en un precio (terminada el 16/11/2026)

| Sprint | Qué quedó hecho |
| --- | --- |
| 7 | Indirectos por mes de obra, honorarios de arquitectos (desde las etapas o por horas × costo) y pase en cascada o sobre el costo. Resumen del costo directo al precio sin IVA y por m² |
| 8 | Emitir congela los costos; nueva versión con los precios de hoy; comparación entre versiones; ajuste por índice (también del paramétrico); vista imprimible y PDF; Excel |

**Lo que no se pudo hacer como estaba escrito:** el paramétrico no toma el costo por m² de la serie ICC Córdoba porque esa serie es un índice, no un costo por m². Sí se puede actualizar por ICC Córdoba o CAC desde el mes de su costo de referencia. Para lo otro haría falta cargar una serie de costo por m².

---

## 5. Etapa 2 · Entorno en la nube (1 sprint)

Todo lo que hace falta para darle acceso a un socio sin tocar la base a mano. **No es el lanzamiento**: el entorno es privado y por invitación.

| Sprint | Semana | Horas | Qué queda hecho | Listo cuando |
| --- | --- | --- | --- | --- |
| **N1** | 23/11 – 27/11 | 14 (lunes 23 feriado) | Supabase (São Paulo) y Vercel con una URL de Vercel, sin dominio propio. Migraciones por CI, copias de seguridad diarias y una restauración probada. Sentry y límites de pedidos en `/login` y `/aprobar` | Un socio entra por invitación y arma un presupuesto |

**Recorte si no entra:** los límites de pedidos pasan al sprint 14.

---

## 6. Etapa 3 · Aprobación y ciclo de obra (6 sprints)

Es el cierre de R1 del plan F, con los diferenciales 1 a 4 adentro.

| Sprint | Semana | Horas | Qué queda hecho | Listo cuando |
| --- | --- | --- | --- | --- |
| **9** | 30/11 – 4/12 | 17 | **G1:** la aprobación por link sirve para cualquier documento (`subject_type` + `subject_id`). Componente **«la cuenta a la vista»** | Las pruebas de órdenes de cambio siguen en verde y el link muestra la cuenta del ajuste |
| **10** | 7/12 – 11/12 | 14 (martes 8 feriado) | El comitente aprueba el presupuesto desde el teléfono; la versión aprobada queda **contractual** y congelada con su huella. **Constancia de recepción** | El PDF aprobado lleva la huella y la constancia |
| **11** | 14/12 – 18/12 | 17 | Contrato: modalidad, serie y período base del ajuste, rezago, anticipo y fondo de reparo, en pesos o dólares. Registro del anticipo cobrado | Contrato de Edificio Alba con un anticipo del 20 % |
| **12** | 21/12 – 24/12 | 14 | Certificado de avance por ítem (anterior, del período, acumulado, tope 100 %) y adicionales de obra aprobados (G4) | Certificado n.º 1 con el 15 % de avance y un adicional |
| — | 28/12 – 1/1 | 0 | **Vacaciones o reserva** [F] | — |
| **13** | 4/1 – 8/1 | 17 | Ajuste CAC con rezago, descuento del anticipo, fondo de reparo y neto a facturar. Aprobación del comitente por link, con la cuenta a la vista. Flujo del director de obra | El certificado ajustado se aprueba desde el teléfono |
| **14** | 11/1 – 15/1 | 17 | Cierre de R1: **expediente de evidencia**, Excel del certificado, facturado y cobrado informativos, páginas de error, alerta si falla el outbox, revisión de rendimiento y de RLS, Playwright del ciclo completo | Un socio nuevo hace obra → presupuesto → contrato → certificado en una sesión |

**Antes del sprint 10:** la consulta al abogado sobre el valor de la aprobación por link de presupuestos y certificados. **Antes del sprint 11:** la reunión con el contador (anticipo, fondo de reparo, IVA en el certificado, diferencias entre constructor, director y administrador). Si alguna no llega, N2 y N3 pasan adelante, porque no dependen de ellas.

---

## 7. Etapa 4 · Diferenciales nuevos (2 sprints)

| Sprint | Semana | Horas | Qué queda hecho | Listo cuando |
| --- | --- | --- | --- | --- |
| **N2** | 18/1 – 22/1 | 17 | **Lo vigente en obra:** QR y link fijo por plano que llevan a la revisión vigente, visor en el celular con sello de superado, «visto por» por revisión y aviso a quien abrió una revisión superada. Piezas portadas del portal MAILANTARKI | Escanear el QR de un plano impreso viejo muestra la vigente |
| **N3** | 25/1 – 29/1 | 17 | **Portal del comitente:** un link por obra con el presupuesto contractual, los certificados, los adicionales y el saldo en pesos y dólares | El comitente de Edificio Alba ve todo sin crear cuenta |

---

## 8. Etapa 5 · Lista para socios (2 sprints)

| Sprint | Semana | Horas | Qué queda hecho | Listo cuando |
| --- | --- | --- | --- | --- |
| **17** | 1/2 – 5/2 | 17 | **Autoservicio:** planes de constructora (Estudio Obra, Constructora), Finanzas de obra activada por plan y no por SQL, límites de usuarios y obras controlados por la base, registro de uso por organización, alta guiada de una constructora | Una constructora se da de alta sola |
| **18** | 8/2 – 12/2 | 10 (carnaval) | **Precios de Córdoba:** catálogo de referencia de materiales con el relevamiento de la otra sesión (canasta de 30 SKU, factor a la unidad de cómputo), vinculable a los insumos como la escala UOCRA. Recordatorio mensual para cargar las series. Guía de puesta en marcha para socios | Un insumo toma el precio de referencia del mes |

**Antes del sprint 18:** confirmar con el abogado que guardar precios de Easy, Blaisten o Prestigio para el presupuesto interno de un cliente no es republicar su catálogo [C]. Si no se puede, el catálogo queda solo con cotizaciones cargadas a mano y las series públicas (INDEC, CAC).

---

## 9. Trabajo que no es código (en paralelo)

### 9.1 Socios de diseño

**Meta: 3 socios activos antes del 12/2** (al menos uno que dirija obra y una constructora chica). Desde N1 ya pueden probar en la nube.

| Cuándo | Qué | Con qué |
| --- | --- | --- |
| Noviembre | Lista de 20 candidatos: estudios conocidos que dirigen obra y constructoras de 5 a 30 personas de Córdoba | Contactos propios, Colegio de Arquitectos, CAC delegación Córdoba |
| Noviembre y diciembre | 8 entrevistas sin mostrar nada | [`guia-entrevistas.md`](guia-entrevistas.md) + bloque de obra del traspaso §5.7 |
| Desde diciembre | Demo en el entorno de la nube con el presupuesto completo | La URL privada de N1 |
| Enero y febrero | 3 socios con compromiso: cargar una obra real a cambio de uso gratis hasta el lanzamiento | Acuerdo simple por escrito |

### 9.2 Validaciones externas

En tres reuniones, con todas las preguntas juntas. La lista completa está en el plan F §6.

| Con quién | Antes de | Qué se valida |
| --- | --- | --- |
| **Profesional de cómputos** | Compuerta del 4/12 | Coeficientes del paramétrico · factor de semicubiertos · plantilla de rubros y de indirectos · los primeros 10 a 30 ítems del catálogo de análisis (hoy son ejemplos inventados) |
| **Abogado** | Sprint 10 (7/12) | Valor de la aprobación por link de presupuestos y certificados · texto que ve el comitente · si el expediente de evidencia alcanza como prueba · uso de precios de terceros (sprint 18) · términos y privacidad (para el lanzamiento) |
| **Contador** | Sprint 11 (14/12) | Zona UOCRA de Córdoba · cargas sociales y Fondo de Cese · qué impuestos van en el pase y si es en cascada · anticipo, fondo de reparo e IVA en el certificado · diferencias entre constructor, director y administrador · criterio de reconocimiento de ingresos |

### 9.3 Datos

- **Series de referencia:** cargar CAC, ICC Córdoba y UOCRA reales desde `/admin/series` todos los meses desde diciembre, para que el entorno de prueba tenga datos verdaderos.
- **Catálogo de análisis:** reemplazar los 4 ejemplos por los ítems validados por el profesional de cómputos.

---

## 10. Etapa 6 · Lanzamiento (cuando haya socios)

No tiene fecha: arranca cuando se cumple la compuerta de la §11. Es el checklist de [`plan-desarrollo-mvp.md`](plan-desarrollo-mvp.md) §10, más lo que sumó Finanzas de obra:

- Dominio propio, correos con Resend verificados, plantillas en español.
- Términos y privacidad revisados por el abogado.
- Cobro: primero por transferencia con factura (definido con el contador), después suscripciones de Mercado Pago.
- Página de producto con los planes de estudio y de constructora y el precio fundador.
- Socios de diseño pasados a cuenta paga o con fecha de pase.

Después del 12/2, por orden: comprobantes con QR de ARCA y facturado y cobrado (A3), observaciones de obra con foto atadas al certificado, avisos y aprobaciones por WhatsApp, y las oleadas del plan F §4 (compras y subcontratos, tesorería, cómputo asistido, contabilidad), que se revisan con lo que pidan los socios.

---

## 11. Compuertas

| Compuerta | Cuándo | Sigue si | Si no |
| --- | --- | --- | --- |
| ~~Interfaz~~ | 15/11 | Francisco eligió B · «Tablero de obra» | — |
| **Presupuesto completo** | 4/12 | El profesional de cómputos o un socio arma Edificio Alba con datos validados y sale en PDF con precio por m² | Se siguen los sprints 9 y 10 y se corrige el catálogo en paralelo |
| **R1 lista** | 15/1 | Un socio hace obra → presupuesto → contrato → certificado en una sesión | N3 se usa para cerrar lo pendiente |
| **Socios** | 12/2 | 3 socios comprometidos, al menos 1 constructora | Antes de seguir, más entrevistas y ajustes del flujo de estudio |
| **R1 en uso** | 4 semanas después del primer socio activo | 2 socios con un presupuesto real por ítem armado en menos de 3 horas, y 1 certificado aprobado por link | Se corrige con lo que digan, antes de sumar funciones |
| **Lanzamiento** | Cuando se cumpla la anterior | 2 socios dicen que pagarían su plan a ese precio | Se revisan precio y foco (estudios o constructoras) |

---

## 12. Calendario

| Semana | Sprint | Horas | Etapa |
| --- | --- | --- | --- |
| 9/11 – 15/11 | UI-1 a UI-4, paneles, 7 · Interfaz y presupuesto con precio | — | 0 y 1, hechas |
| 16/11 – 20/11 | 8 · Versiones, comparación, índice, PDF y Excel (hecho) + preparar socios y validaciones | — | 1, hecha |
| 23/11 – 27/11 | N1 · Entorno en la nube | 14 | 2 |
| 30/11 – 4/12 | 9 · Aprobación genérica y la cuenta a la vista | 17 | 3 |
| 7/12 – 11/12 | 10 · Presupuesto aprobado y constancia de recepción | 14 | 3 |
| 14/12 – 18/12 | 11 · Contrato y anticipo | 17 | 3 |
| 21/12 – 24/12 | 12 · Certificado de avance y adicionales de obra | 14 | 3 |
| 28/12 – 1/1 | Vacaciones o reserva | 0 | — |
| 4/1 – 8/1 | 13 · Ajuste CAC, descuentos y flujo del director | 17 | 3 |
| 11/1 – 15/1 | 14 · Cierre de R1 y expediente de evidencia | 17 | 3 |
| 18/1 – 22/1 | N2 · Lo vigente en obra | 17 | 4 |
| 25/1 – 29/1 | N3 · Portal del comitente | 17 | 4 |
| 1/2 – 5/2 | 17 · Autoservicio y planes de constructora | 17 | 5 |
| 8/2 – 12/2 | 18 · Precios de Córdoba y guía para socios (lunes 8 y martes 9, carnaval) | 10 | 5 |

**Total pendiente:** 11 sprints y una semana de reserva, unas 171 horas, del 23/11/2026 al 12/2/2027.

---

## 13. Riesgos

| Riesgo | Señal | Qué se hace |
| --- | --- | --- |
| No aparecen socios | Menos de 8 entrevistas al 31/12 | Demo en la nube a los candidatos que no quieren entrevista; pedir ayuda a un contador o al Colegio para llegar a constructoras |
| Las validaciones no llegan a tiempo | Sin fecha con el abogado al 30/11 o con el contador al 7/12 | N2 y N3 pasan adelante; los sprints 10 y 11 esperan |
| Portar piezas del portal cuesta más de lo previsto | N2 sin terminar el 22/1 | El «visto por» y el aviso pasan a después del 12/2; el QR y el link fijo se quedan |
| Dispersión: pedidos fuera del plan | Pedidos nuevos en cada demo | Lista «después» revisada en cada compuerta |
| Una sola persona a 17 horas por semana | Dos sprints seguidos con más del 20 % sin terminar | Recortes del plan F §8; nunca correr la fecha en silencio |

---

## 14. Decisiones que necesito de Francisco

1. **Vacaciones:** si la semana del 28/12 es descanso o reserva.
2. **Portal MAILANTARKI:** recomiendo que siga como producto propio de MAILANTARKI y que preste sus piezas, sin fusionar los repositorios [F].
3. **Socios:** si tenés contactos de estudios que dirigen obra o de constructoras para la lista de candidatos.
4. **Profesionales:** si ya hay un contador, un profesional de cómputos y un abogado con quienes hacer las tres consultas.
