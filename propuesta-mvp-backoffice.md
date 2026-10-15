# Propuesta de negocio: MVP backoffice para estudios de arquitectura

Actualizado: 15/10/2026 · Autor: Francisco

Documento base: la investigación completa (más de 100 fuentes) está en el doc [Gestión integral de desarrollos inmobiliarios](https://claude.ai/code/artifact/cbdbe68c-f386-48e7-9da3-abe7ae1f27ad) y la versión editable de esta propuesta en [Propuesta de negocio](https://claude.ai/code/artifact/6e7a3f65-b041-4674-848e-1dd8b15ce449).

---

## 1. Resumen

La propuesta es convertir tu gestor de proyectos en un **backoffice para estudios de arquitectura** que resuelve dos problemas que les cuestan plata y que ningún producto del mercado une: **los cambios que pide el cliente y nunca se cobran**, y **el trabajo con planos y renders desactualizados**. El MVP evita a propósito todo lo que depende de organismos o normativa (facturación, impuestos, aportes, trámites, pagos) y deja el inventario de unidades para una segunda etapa, cuando los estudios que lo usen te abran la puerta a sus desarrolladoras.

| Dato clave | Valor | Tipo |
| --- | --- | --- |
| Plazo hasta el lanzamiento pago | 12 semanas, partiendo de tu gestor actual | Estimación |
| Costo de infraestructura al lanzar | Cerca de USD 85 por mes | Calculado con precios publicados |
| Precio | USD 49 y 99 por mes; usuarios externos gratis | Hipótesis a validar |
| Punto de equilibrio con sueldo objetivo de USD 1.500 | Unas 27 cuentas pagas | Cálculo con supuestos |
| Mercado inicial | Córdoba: más de 14.000 arquitectos matriculados | Dato con fuente |
| Diferencial | Única herramienta que une honorarios por etapa con cambios aprobados por el cliente y marca lo que quedó desactualizado | Resultado de la revisión de 33 competidores |
| Primera compuerta | 5 estudios pagando al final de la semana 12 | Meta propuesta |

El sueldo objetivo, los precios y las cantidades de clientes son supuestos para reemplazar con tus números; las secciones 7 y 8 muestran la cuenta para recalcularla.

## 2. El problema

Estudios y desarrolladoras no pierden plata por falta de un lugar donde guardar archivos, sino porque la misma información vive copiada en planillas, carpetas y chats que se contradicen. El MVP ataca la primera, la tercera y la cuarta; la doble reserva queda para la segunda etapa, con las desarrolladoras:

| Pérdida | Cómo ocurre hoy | Evidencia |
| --- | --- | --- |
| Trabajar o vender con información vieja | Se construye con un plano no vigente o se publica un render que ya no coincide con el proyecto | En EE. UU., los equipos de construcción dedican 5,5 horas por semana a buscar información y el 48% del retrabajo viene de datos malos y mala comunicación ([FMI/PlanGrid](https://www.autodesk.com/blogs/construction/construction-disconnected-fmi-report/)). En Argentina, lo que muestra la publicidad obliga al vendedor ([Ley 24.240, art. 8](https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm)) |
| Doble reserva y precios no autorizados | Disponibilidad y lista de precios en planillas copiadas entre vendedores y brokers | Un tribunal porteño ordenó en 2025 devolver una seña de US$20.000 por cambios en una unidad vendida en pozo ([nota](https://estudiovilaplana.com.ar/2025/09/19/camara-civil-ordena-devolver-sena-de-usd-20-000-por-incumplimientos-en-proyecto-en-pozo/)) |
| Cambios que el estudio no cobra | El cliente pide modificaciones por WhatsApp y nadie calcula su costo | La utilización promedio de estudios de arquitectura en EE. UU. y Canadá fue 61,1% en 2025, o sea cerca de 39% de horas no facturables ([Deltek Clarity](https://www.deltek.com/en/about/media-center/press-releases/2025/what-the-46th-annual-deltek-clarity-ae-study-reveals-about-the-industry)) |
| No saber si el proyecto deja ganancia | Horas, honorarios e inflación se cruzan a mano, si se cruzan | El 92,6% del sector argentino dice que sus proyectos superan regularmente plazos y costos, y casi dos tercios intercambian información por correo o archivos ([encuesta BIM Forum – CAMARCO 2023](https://elconstructor.com/el-bim-forum-argentina-y-camarco-comparten-los-resultados-de-la-encuesta-sobre-digitalizacion-del-sector)) |

El competidor real no es otro software sino la combinación de Google Drive, WhatsApp y Excel: es gratis, todos lo saben usar y no avisa cuando algo está mal.

## 3. La solución

Sobre tu gestor actual (proyectos, tareas y archivos) se suman dos capas para el estudio; una tercera, para la desarrolladora, llega después del lanzamiento.

| Capa | Qué agrega | Problema que elimina | Cuándo |
| --- | --- | --- | --- |
| Base (ya existe) | Proyectos, etapas, tareas, archivos, equipo | Desorden general | Ya está |
| 1. Plata del proyecto | Honorarios por etapa (fijo, por hora o mixto); horas contra presupuesto; ajuste de montos por un índice que carga el usuario; órdenes de cambio que el cliente aprueba por link; panel de lo recuperado | Cambios no cobrados, rentabilidad desconocida | MVP |
| 2. Lo vigente | Revisiones con estado; la revisión nueva reemplaza a la anterior y marca "a revisar" los renders y planos de venta que dependían de ella; comentarios sobre imagen y PDF con estados y contador de rondas; registro de envíos | Trabajar con información vieja, correcciones dispersas | MVP |
| Transversal | Invitados externos gratis (cliente, renderista, contratista); vencimientos propios; auditoría; exportación a Excel | Todo por WhatsApp, "¿quién aprobó esto?" | MVP |
| 3. Unidades | Inventario, reservas que vencen solas, portal de brokers | Doble reserva, listas de precios viejas | Segunda etapa, con 15 a 20 estudios activos |

**La frase de venta:** "Cobrá cada cambio que te pide el cliente y que nadie trabaje con un plano viejo."

**Por qué este alcance.** De los 33 competidores revisados, los de gestión de estudios (Monograph, BQE Core, Mosaic) manejan honorarios por etapa pero el cliente no aprueba cambios desde un portal; los de constructoras (Houzz Pro, JobTread, Buildertrend, Archdesk) tienen esa aprobación pero no honorarios por etapa; y ninguno marca como desactualizado lo que dependía de un plano reemplazado. En cambio, la reserva de unidades ya la resuelve bien Urbantify en Argentina, así que no conviene empezar por ahí.

**Por qué los usuarios externos entran gratis.** Cada estudio invita a sus clientes, renderistas y contratistas; JobTread usa el mismo modelo, con portales gratis e ilimitados ([JobTread](https://www.jobtread.com/pricing)). Una desarrolladora que aprueba cambios de un estudio que usa el producto es el mejor prospecto para la segunda etapa.

## 4. Qué queda afuera del MVP para no entrar en burocracia

La regla es simple: el MVP **calcula, ordena y avisa, pero nunca actúa ante un organismo ni mueve dinero**. Todo lo que exige integrarse con el Estado, interpretar normativa o asumir responsabilidad legal o fiscal queda afuera, y donde el cliente lo necesita, el sistema exporta los datos para que lo haga su contador, su escribano o su sistema actual.

| Fuera del MVP | Por qué es burocracia | Qué hace el MVP en su lugar |
| --- | --- | --- |
| Facturación electrónica ARCA | Certificados fiscales, regímenes y responsabilidad tributaria | Exporta honorarios y adicionales a Excel para que facture el contador o su sistema |
| Aportes a la Caja 8470 y tasas de visado del Colegio | Reglas que cambian por resolución y errores con consecuencia profesional | Vencimiento manual configurable ("pagar visado antes del 1/4") |
| Trámites municipales (Obras Privadas Digital, Mi Docta) | Sin API pública; responsabilidad sobre presentaciones | Tablero de vencimientos que el usuario carga a mano |
| Cobros a compradores y pasarelas de pago | Regulación financiera, conciliación, contracargos | Registro informativo de señas y reservas, sin procesar pagos |
| Cuotas de boletos y fideicomisos | Contratos con compradores, defensa del consumidor, índices pactados | Se deja a MOBU, Urbantify, Lebane o la planilla del cliente; integración en una fase posterior |
| Identificación de clientes para prevención de lavado | Obligaciones de sujetos obligados ante la UIF | No se piden datos sensibles de compradores |
| Firma digital con validez legal | Certificadores licenciados (Ley 25.506) | Aprobación interna con registro de usuario, fecha y versión |
| Verificación normativa y cálculo de cabida | Interpretación de ordenanzas en transición | Nada; es una fase futura separada |
| Contabilidad e impuestos | Normas contables y fiscales | Reportes de gestión, no contables |

**Lo poco que no se puede evitar** corre por tu lado como empresa, no por el producto: facturarles a tus propios clientes (como monotributista o sociedad), publicar términos y condiciones y una política de privacidad, y tratar los datos personales según la Ley 25.326. Conviene una consulta puntual con un contador y un abogado antes de cobrar; que el contador confirme también si tu actividad requiere alguna inscripción adicional.

## 5. Cliente objetivo y competencia

El primer cliente es el **estudio de arquitectura de 2 a 15 personas en Córdoba que proyecta edificios para desarrolladoras**: usa el producto todos los días, tiene el problema de cambios no cobrados y lleva el producto a sus clientes desarrolladores. La desarrolladora mediana es el segundo cliente y paga más.

| Segmento | Cuántos hay | Qué compra | Por qué primero o después |
| --- | --- | --- | --- |
| Estudios de 2 a 15 personas | El número de estudios activos no está publicado; hay más de 14.000 arquitectos matriculados en Córdoba ([La Voz de San Justo](https://www.lavozdesanjusto.com.ar/nicolas-paulin-asumio-como-presidente-del-colegio-de-arquitectos-de-cordoba)) | Todo el MVP | Primero: ciclo de venta corto, decide el dueño |
| Desarrolladoras medianas | 46 desarrollistas en CEDUC ([CEDUC](https://ceduc.com.ar/socios-desarrollistas/)); más de 190 empresas en CEDU, Buenos Aires ([CEDU](https://www.cedu.com.ar/)) | Segunda etapa: unidades y brokers | Segundo: pagan más pero deciden más lento; llegan vía estudios |
| Estudios de renders y freelancers | Sin dato | Nada: entran gratis como invitados | Canal de difusión |
| Constructoras pyme | 1.387 empleadores de la construcción en Córdoba ([IERIC](https://www.ieric.org.ar/wp-content/uploads/2026/09/IERIC-Informe-Coyuntura-Construccion-No-251.pdf)) | Obra y compras | Después: ahí ya compiten Lebane y otros |

### Competencia y posicionamiento

| Alternativa | Qué resuelve | Por qué no alcanza | Cómo convivir |
| --- | --- | --- | --- |
| Drive + WhatsApp + Excel | Todo, gratis | No sabe qué está vigente, no bloquea reservas, no avisa | Importar desde Drive; avisos por correo y más adelante WhatsApp |
| [Lebane](https://www.forbesargentina.com/negocios/crearon-software-gestionar-proyectos-construccion-acaban-levantar-us-4-millones-n86243) | Obra y finanzas por WhatsApp para desarrolladoras; levantó US$4 millones | No apunta al estudio ni a la documentación de proyecto | Socio, no rival |
| [MOBU](https://mobu.market/negocios/desarrollos-inmobiliarios), [Urbantify](https://www.urbantify.com/) | Ventas, boletos y cuotas | Sin vínculo con planos y renders | Integración posterior: el MVP no hace cuotas |
| [Winbuild](https://mercado.com.ar/ruta-digital/winbuild-sumo-100-desarrolladoras-en-un-ano-con-tecnologia-para-proyectos-de-pozo), [Urbania 3D](https://www.forbesargentina.com/negocios/son-estudiantes-arquitectura-crearon-una-app-revoluciona-forma-vender-departamentos-pozo-n93877) | Showroom virtual y CRM para pozo | El material no se actualiza solo cuando cambia el proyecto | Proveerles el material vigente |
| [Tokko Broker](https://www.tokkobroker.com/es-otros/funcionalidades), [KiteProp](https://www.kiteprop.com/ar/plans) | CRM y portales para inmobiliarias | Sin inventario por unidad ni reservas | El portal de brokers de la segunda etapa les complementa |
| [Monograph](https://monograph.com/pricing), [Fixner](https://fixner.com/software-psa/estudios-arquitectura) | Gestión de estudios en EE. UU. y España | Sin pesos, sin español rioplatense, sin etapas argentinas, sin índices | Referencia funcional |

El posicionamiento es estrecho a propósito: **el sistema que sabe qué está vigente y cuánto cuesta cada cambio**. No es un ERP, ni un CRM, ni un software de obra.

## 6. Alcance del MVP

El MVP suma 9 entidades a tu gestor y 3 máquinas de estados, ordenadas por impacto: lo primero que se construye es lo que el estudio puede convertir en plata la primera semana.

### Funciones, en orden de impacto

| # | Función | Historia de usuario | Idea tomada de | Esfuerzo |
| --- | --- | --- | --- | --- |
| 1 | Orden de cambio aprobada por link | Como estudio, convierto un pedido del cliente en un adicional con horas y monto; el cliente lo aprueba desde un link sin crear cuenta | [JobTread](https://www.jobtread.com/features/change-orders): link seguro. [Houzz Pro](https://pro.houzz.com/pro-help/r/creating-and-sending-change-orders): se cobra solo la diferencia y la firma se invalida si se edita | Bajo |
| 2 | Honorarios por etapa | Como estudio, defino croquis, anteproyecto, documentación y dirección de obra con honorario fijo, por hora o mixto | [Monograph](https://monograph.com/features/project-planning) | Medio |
| 3 | Horas contra presupuesto | Como arquitecto, cargo horas por etapa desde el teléfono y veo cuánto se consumió | Monograph, [BQE Core](https://corehelpcenter.bqe.com/hc/en-us/articles/33553934495639-Project-Center-Budget) | Medio |
| 4 | Ajuste por índice | Como estudio, cargo el valor del índice del mes y veo los honorarios pendientes actualizados | Propio: ningún competidor lo hace | Bajo |
| 5 | Revisiones y piezas "a revisar" | Como arquitecto, publico la revisión C02 y recibo la lista de renders y planos de venta que dependían de la anterior | [Aconex](https://help.aconex.com/documents/update-supersede-a-document/) para el reemplazo; lo demás es propio | Medio |
| 6 | Registro de envíos | Como estudio, sé qué versión le mandé a cada cliente o contratista y cuándo, con copia exacta | [Newforma](https://projectcenter.help.newforma.com/overviews/activity_centers/project_transmittals_window) | Bajo |
| 7 | Comentarios y rondas | Como estudio, comento sobre un punto del render o del PDF y cuento las rondas contratadas | [iMeshh Pro](https://www.imeshh.com/pricing), [Filestage](https://filestage.io/pricing/) | Medio |
| 8 | Invitados gratis | Como cliente o renderista, entro por un enlace por correo y veo solo lo mío | JobTread | Bajo |
| 9 | Panel de lo recuperado | Como dueño, veo cuánto sumaron los cambios aprobados en cada proyecto | Propio | Bajo |
| 10 | Vencimientos, auditoría, exportación | Como usuario, creo avisos propios, veo quién aprobó qué y exporto a Excel para facturar | — | Bajo |

### Entidades nuevas

| Entidad | Campos clave | Se relaciona con |
| --- | --- | --- |
| Etapa de honorarios | proyecto, etapa, tipo (fijo, hora, mixto), monto, moneda, índice base | Proyecto, Orden de cambio, Registro de horas |
| Registro de horas | persona, etapa, fecha, horas | Etapa de honorarios |
| Orden de cambio | descripción, horas, monto, documentos afectados, estado | Proyecto, Etapa, Revisión, Aprobación |
| Aprobación | token del link, firmante, fecha, huella (hash) del contenido aprobado | Orden de cambio, Revisión |
| Índice | nombre, período, valor, quién lo cargó | Etapa de honorarios |
| Revisión | documento, código, estado, autor, fecha, archivo | Documento, Dependencia, Envío |
| Dependencia | pieza (render, plano de venta, brochure), revisión de origen, estado | Revisión |
| Envío | revisiones o piezas enviadas, destinatario, fecha, canal | Revisión, Invitado |
| Comentario anclado | archivo, versión, posición en la imagen o página, estado, ronda | Revisión, Dependencia |

### Máquinas de estados

| Entidad | Estados | Regla clave |
| --- | --- | --- |
| Orden de cambio | borrador → enviada → aprobada o rechazada → facturable | Editar una orden enviada o aprobada la vuelve a borrador y anula la aprobación; al aprobarse suma a su etapa |
| Revisión | borrador → compartida → publicada → reemplazada | Una sola revisión publicada por documento; publicar otra reemplaza la anterior y dispara las dependencias |
| Pieza dependiente | vigente → a revisar → obsoleta o revalidada | Pasa a "a revisar" cuando su revisión de origen es reemplazada; alguien decide si sigue sirviendo |

### Decisiones técnicas sugeridas

Mantener el stack de tu gestor; si arrancás de cero, una aplicación web con base PostgreSQL alcanza, con seguridad por fila para que cada invitado vea solo lo suyo. Guardar una huella (hash) del contenido aprobado permite demostrar exactamente qué aprobó el cliente. Archivos en almacenamiento de objetos, avisos por correo transaccional y una cola simple para vencimientos y dependencias. Invitados con enlace mágico por correo, sin contraseña. Un registro de eventos desde el primer día da la auditoría casi gratis.

### Segunda etapa, fuera del MVP

Inventario de unidades con reservas que vencen y portal de brokers (copiar de [Urbantify](https://www.urbantify.com/) la reserva que bloquea la unidad al instante, o integrarse con ellos); pedido de renders con cotizaciones comparables; plan para desarrolladoras. Se abre cuando haya 15 a 20 estudios activos.

## 7. Modelo de negocio y precios

Suscripción mensual por estudio, no por usuario, con los invitados externos gratis: el precio no castiga sumar gente y cada invitado ve el producto funcionando. Los precios son hipótesis para validar en la preventa.

| Plan | Precio (hipótesis) | Incluye | Para quién |
| --- | --- | --- | --- |
| Invitado | Gratis | Ver lo compartido, comentar y aprobar órdenes de cambio | Clientes, renderistas, contratistas |
| Estudio | USD 49 por mes | Hasta 5 usuarios internos y 10 proyectos activos; todo el MVP | Estudios chicos |
| Estudio Pro | USD 99 por mes | Hasta 15 usuarios, proyectos ilimitados, panel de lo recuperado por proyecto y reportes | Estudios medianos |
| Puesta en marcha (opcional) | USD 150 por única vez | Carga inicial de proyectos, etapas y documentos | Quien no quiere cargar solo |

El plan para desarrolladoras queda para la segunda etapa, junto con el inventario de unidades.

Condiciones propuestas: facturación en pesos al tipo de cambio del día, 30 días de prueba, dos meses gratis con pago anual y un **precio fundador** del 50% durante 6 meses para los primeros 10 clientes.

**Referencias de precio.** Monograph publica de USD 45 a 490 por mes según el tamaño del estudio ([Monograph](https://monograph.com/pricing)); el plan de Houzz Pro con órdenes de cambio cuesta USD 199 por mes ([Houzz Pro](https://www.houzz.com/houzz-pro/pricing)) y JobTread arranca en USD 199 más usuarios ([JobTread](https://www.jobtread.com/pricing)). En Argentina, KiteProp cobra entre $78.430 y $180.992 por mes más IVA ([KiteProp](https://www.kiteprop.com/ar/plans)). El precio propuesto queda por debajo de las opciones internacionales y cerca de los verticales locales.

**Ticket promedio supuesto** (60% Estudio y 40% Estudio Pro):

```
0,6 × 49 + 0,4 × 99 = USD 69 por cuenta por mes
```

## 8. Costos, escenarios y punto de equilibrio

El negocio casi no tiene costos fijos fuera de tu tiempo: la infraestructura cuesta unos USD 85 por mes al lanzar, y con unas 27 cuentas pagas el producto cubre un sueldo objetivo de USD 1.500.

### Costos mensuales al lanzar

| Concepto | USD por mes | Base |
| --- | --- | --- |
| Hosting de la aplicación (Vercel Pro, 1 desarrollador) | 20 | [Vercel](https://vercel.com/pricing); el plan gratuito es solo para uso no comercial |
| Base de datos y autenticación (Supabase Pro) | 25 | [Supabase](https://supabase.com/pricing): 8 GB de base y 100 GB de archivos incluidos |
| Archivos pesados (Cloudflare R2, 100 GB) | 1,35 | [R2](https://developers.cloudflare.com/r2/pricing/): USD 0,015 por GB-mes, 10 GB gratis, sin costo de salida |
| Correo transaccional (Resend Pro) | 20 | [Resend](https://resend.com/pricing): 50.000 correos por mes |
| Dominio y herramientas varias | 20 | Estimación |
| **Infraestructura total** | **≈ 85** | |
| Contador | 80 | Supuesto; reemplazar por tu presupuesto |
| Publicidad y demos | 100 | Supuesto |
| **Costos fijos sin sueldo** | **≈ 265** | |
| Sueldo objetivo del fundador | 1.500 | Supuesto; reemplazar por el tuyo |

Las cifras de proveedores son precios publicados al 15/10/2026, sin impuestos. Podés reemplazar cualquier proveedor por el que ya uses en tu gestor; el orden de magnitud no cambia.

### Punto de equilibrio

Con ticket promedio de USD 69 y un 5% supuesto de comisión del medio de cobro (a verificar con el que elijas), cada cuenta deja unos USD 65,5:

```
Cuentas para cubrir costos y sueldo = (265 + 1.500) / 65,5 ≈ 27
```

Sin sueldo, alcanzan 5 cuentas para cubrir los costos fijos. El punto de equilibrio sube respecto de un producto con plan para desarrolladoras: es el costo de empezar con un alcance más chico, y el número a validar con más cuidado en las entrevistas.

### Escenarios a 12 meses del lanzamiento

| Escenario | Cuentas pagas | Ingreso mensual (USD) | Costos fijos (USD) | Resultado antes de tu sueldo (USD) | ¿Cubre USD 1.500? |
| --- | --- | --- | --- | --- | --- |
| Pesimista | 8 | 552 | 265 | 259 | No |
| Base | 30 | 2.070 | 280 | 1.687 | Sí, con margen chico |
| Optimista | 50 | 3.450 | 330 | 2.948 | Sí |

El resultado descuenta el 5% de comisión; los costos fijos suben con más almacenamiento y base de datos (estimación). Los tres escenarios suponen una baja mensual del 3% de clientes y ningún empleado. El escenario base implica sumar unas 3 cuentas netas por mes; la segunda etapa (desarrolladoras) es la que puede subir el ticket promedio.

## 9. Plan de salida al mercado

La venta empieza antes de terminar el producto y en persona: con 5 estudios socios de diseño en Córdoba y crecimiento por invitación de sus clientes y proveedores.

| Paso | Qué hacer | Resultado esperado |
| --- | --- | --- |
| 1. Entrevistas | 15 estudios y 5 desarrolladoras de Córdoba, por contacto directo, LinkedIn y referidos. Preguntas: "¿qué error les costó plata en el último proyecto?" y "¿qué planilla actualizan a mano?" | Lista de dolores con ejemplos y montos reales |
| 2. Socios de diseño | Elegir 5 estudios que usen el producto gratis 3 meses a cambio de una reunión quincenal | Uso real y testimonios |
| 3. Preventa | Ofrecer el precio fundador con pago anticipado de 3 meses | Validación de precio; ingreso inicial |
| 4. Crecimiento por invitación | Cada portal de invitado muestra "hecho con" y un enlace de prueba | Desarrolladoras, brokers y renderistas que llegan solos |
| 5. Herramienta gratuita de entrada | Calculadora pública de honorarios actualizados por índice, o plantilla de orden de cambio | Contactos de estudios interesados |
| 6. Alianzas sin burocracia | Estudios de renders que ya trabajan con varios estudios: ellos invitan a sus clientes | Canal de referidos con comisión por cuenta paga |
| 7. Contenido | Casos cortos de los socios de diseño ("recuperamos tantas horas de cambios") en LinkedIn e Instagram | Prospectos para demos |

No hacen falta acuerdos con colegios, cámaras ni municipios para empezar; pueden sumarse después como canal, nunca como requisito.

## 10. Plan de trabajo de 12 semanas

El orden sigue al dolor principal: primero la plata del proyecto (honorarios, horas y órdenes de cambio, lo más fácil de demostrar) y después lo vigente (revisiones, envíos y comentarios). Las unidades quedan para después del lanzamiento.

| Semanas | Trabajo | Hito |
| --- | --- | --- |
| 1–2 | Entrevistas y prototipo navegable | Compuerta 1 (fin de semana 2): problema confirmado |
| 3–5 | Honorarios por etapa, horas e índice | Preventa a socios de diseño (semana 4) |
| 5–12 | Socios de diseño usando el producto | — |
| 6–7 | Órdenes de cambio aprobadas por link | Compuerta 2 (fin de semana 7): uso semanal |
| 8–9 | Revisiones, piezas "a revisar" y registro de envíos | — |
| 10 | Comentarios anclados y contador de rondas | — |
| 11 | Panel de lo recuperado, auditoría, exportación | — |
| 12 | Lanzamiento pago | Compuerta 3: 5 cuentas pagas |

Las duraciones son estimaciones para unas 30 horas semanales de desarrollo y suponen que reutilizás usuarios, proyectos, tareas y archivos de tu gestor; si alguna capa ya está hecha, el plan se acorta. Las compuertas de las semanas 2 y 7 son puntos para corregir o frenar, no trámites.

## 11. Métricas, compuertas y riesgos

Tres compuertas deciden si seguir, corregir o frenar; las metas son propuestas propias, no estándares.

| Compuerta | Cuándo | Meta para seguir | Si no se cumple |
| --- | --- | --- | --- |
| 1. Problema confirmado | Semana 2 | Al menos 8 de 15 estudios describen una pérdida concreta por cambios no cobrados o versiones viejas | Cambiar el foco a la capa con más dolor detectado |
| 2. Uso real | Semana 7 | 3 de 5 socios usan el producto todas las semanas y suben revisiones reales | Simplificar la carga; revisar la importación desde Drive |
| 3. Pago | Semana 12 | 5 cuentas pagan, contando la preventa | Revisar precio y plan antes de invertir más tiempo |

**Métricas para seguir desde el día uno:** cuentas activas por semana; proyectos con al menos una revisión publicada; invitados externos por cuenta (motor de crecimiento); órdenes de cambio aprobadas y su monto (el valor que el estudio recupera); conversión de prueba a pago; baja mensual de clientes.

### Riesgos

| Riesgo | Probabilidad | Mitigación |
| --- | --- | --- |
| Los estudios no cambian Drive y WhatsApp por otra herramienta | Alta | Importar desde Drive; invitados sin contraseña; avisos por correo; empezar por una sola función que duela (órdenes de cambio) |
| Disposición a pagar baja en estudios chicos y con el sector en baja (ISAC −4,4% interanual en agosto de 2026, [INDEC](https://www.indec.gob.ar/uploads/informesdeprensa/isac_10_2674E79F6A29.pdf)) | Media-alta | Precio por empresa, precio fundador, mostrar en pesos lo recuperado con órdenes de cambio |
| Un competidor con capital amplía su producto hacia el estudio | Media | Foco estrecho; integrarse en lugar de competir; velocidad con los socios de diseño |
| Te dispersás construyendo funciones de otros (cuotas, facturación, CRM) | Alta | La tabla de la sección 4 es la lista de "no"; toda función nueva debe atacar uno de los dos problemas del MVP |
| Dependencia de una sola persona | Alta | Documentar, usar servicios administrados y mantener el stack simple |
| Datos de clientes expuestos | Baja-media | Seguridad por fila, copias de seguridad, permisos por proyecto, política de privacidad |

Las probabilidades son una evaluación propia.

## 12. Próximos pasos

- [ ] Revisar qué partes de tu gestor ya cubren la base (usuarios, proyectos, archivos) y ajustar el plan de 12 semanas.
- [ ] Reemplazar los supuestos de la sección 8 por tus números: sueldo objetivo, horas disponibles, contador.
- [ ] Armar la guía de entrevista con las dos preguntas de la sección 9 y agendar las primeras 5.
- [ ] Preparar un prototipo navegable de tres pantallas: revisión publicada con piezas obsoletas, orden de cambio aprobada por el cliente, honorarios por etapa con el panel de lo recuperado.
- [ ] Elegir los 5 estudios socios de diseño y ofrecer el precio fundador.
- [ ] Consultar a un contador y un abogado sobre cómo facturar y los términos y la política de privacidad.

---

## Anexo A. Competidores por área del MVP

Ninguno de los 33 productos revisados marca como desactualizados los renders o planos de venta cuando cambia el plano, y ninguno une honorarios por etapa con cambios aprobados por el cliente desde un portal. "Cómo superarlo" es lo que el MVP puede hacer mejor. Precios publicados al 15/10/2026.

### A.1 Lo vigente: planos y documentos

| Empresa | Qué hace parecido | Cómo superarlo en el MVP | Notas |
| --- | --- | --- | --- |
| [Oracle Aconex](https://help.aconex.com/documents/update-supersede-a-document/) | La revisión nueva reemplaza a la anterior; envíos registrados a otras empresas; estado "fuera de uso" | Además de reemplazar el plano, marcar como viejos los renders y piezas comerciales que dependían de él | Para proyectos grandes; sin precio publicado. Los externos siguen viendo la versión vieja hasta que se les envía la nueva |
| [Newforma](https://projectcenter.help.newforma.com/overviews/activity_centers/project_transmittals_window) | Registro de envíos con copia de lo enviado y compara qué cambió | Lo mismo, en la nube y con invitados que entran por un enlace | Pensado para servidores propios; en inglés, francés y alemán |
| [Autodesk Forma Data Management](https://www.autodesk.com/products/forma-data-management/overview) (antes Autodesk Docs) | Versiones, aprobaciones de planos y registro de envíos | Ligar cada versión a las unidades y al material comercial | Desde USD 45 por mes; las aprobaciones no vienen en el plan básico |
| [Dalux Box](https://www.dalux.com/products/dalux-box/) | Estado y revisión de cada documento; áreas compartida y publicada; listas de distribución | En español y para estudios chicos, sin implementación | Sin precio público; lo gratuito es el visor, no Box |
| [Bluebeam](https://www.bluebeam.com/uk/pricing/) | Compara planos y reemplaza revisiones en un set | Control de dependencias, que Bluebeam no tiene | £264 a 588 por usuario por año (precios del Reino Unido) |
| [Revizto](https://revizto.com/pricing) | Numera versiones de hojas y superpone para ver cambios | Avisos a todos los vinculados; Revizto los insinúa pero no están confirmados | Sin precio público |
| [Thinkproject](https://www.thinkproject.com/products/cde/) | Revisiones controladas y envíos | Simplicidad y precio | Para infraestructura y grandes empresas; precio a cotizar |

### A.2 Lo vigente: renders

| Empresa | Qué hace parecido | Cómo superarlo en el MVP | Notas |
| --- | --- | --- | --- |
| [Filestage](https://filestage.io/pricing/) | Comentarios sobre la imagen, versiones, revisores sin cuenta | Vincular la imagen a la revisión del plano y a las tipologías que muestra | USD 199 a 329 por mes con 10 usuarios |
| [ReviewStudio](https://reviewstudio.com/pricing-plans/) | Compara versiones, varios aprobadores, aprobadores invitados | Contar las rondas de corrección contratadas y avisar cuando la imagen queda vieja | USD 12 a 25 por usuario por mes; los flujos por etapas solo en el plan alto |
| [iMeshh Pro](https://www.imeshh.com/pricing) | Portal donde el cliente comenta, estados borrador → en revisión → aprobado → entregado | Hacerlo del lado de quien encarga los renders (estudio o desarrolladora), no del que los produce | En beta; £22,40 a 37,80 por mes; pensado para el estudio de renders |
| [Lumion Cloud](https://lumion.com/product/buy) | Compartir renders, recibir comentarios y aprobar versiones | No depender del programa con que se hizo el render | En beta y gratis con Lumion; el visor Lumion View se discontinúa (lo reemplaza Axogram) |

### A.3 Unidades, reservas y brokers (segunda etapa)

| Empresa | Qué hace parecido | Cómo superarlo | Notas |
| --- | --- | --- | --- |
| [Urbantify](https://www.urbantify.com/) | Estado de cada unidad en tiempo real; la reserva bloquea la unidad para todos al instante; inmobiliarias externas con comisión | Vincular cada unidad a sus planos y renders vigentes | El competidor más cercano en Argentina. Precio no publicado |
| [MOBU](https://mobu.market/negocios/desarrollos-inmobiliarios) | Catálogo de unidades, reservas con saldo, comisiones | Foco: MOBU es un sistema de gestión general | Argentino; precio por módulos sin montos publicados |
| [Winbuild](https://winbuild.app/) | Disponibilidad piso por piso y módulo para brokers | Que el material del showroom se actualice solo cuando cambia el proyecto | Más de 100 clientes; showroom virtual 360 |
| [Urbania 3D](https://urbania3d.app/en) | Panel de disponibilidad y links ilimitados para brokers | Lo mismo que con Winbuild | De Rosario; cobra un pago inicial más mantenimiento anual |
| [Avesdo](https://avesdo.com/features/realtor-portals/) | Portal de brokers con inventario en vivo; la desarrolladora elige qué precios mostrar | Sumar el registro del cliente que trae cada broker, con fecha y hora | Canadá; sin precio público |
| [Spark.re](https://www.spark.re/product/inventory) | Grilla de unidades por piso, asignación a compradores, comisiones de brokers | Español, pesos y precio pyme | Norteamérica; cobra por proyecto |
| [Lasso CRM](https://support.lassocrm.com/hc/en-us/articles/201780194-Manage-Inventory-Unit-Details) | Asigna compradores y vendedores a cada unidad, con señas y precios | Bloqueos que vencen solos | Norteamérica; centrado en captar interesados |
| [Sperant](https://sperant.com/productos/) | Inventario, propuestas comerciales y portal de propietarios | Integraciones con herramientas argentinas | Perú; sin precio público |
| [KiteProp](https://www.kiteprop.com/ar/plans) y [Tokko Broker](https://www.tokkobroker.com/es-otros/funcionalidades) | Gestión de clientes y publicación en portales | Sin inventario por unidad: el portal de brokers los complementa | KiteProp cuesta $78.430 a 180.992 por mes + IVA |

### A.4 Plata del proyecto: honorarios, horas y cambios

| Empresa | Qué hace parecido | Cómo superarlo en el MVP | Notas |
| --- | --- | --- | --- |
| [Monograph](https://monograph.com/features/project-planning) | Honorario por etapa (fijo, por hora o mixto); horas reales contra lo planificado | Que el cliente apruebe el cambio desde su portal; en pesos y con ajuste por índice | USD 45 a 490 por mes; los servicios adicionales se cargan como una etapa nueva, sin aprobación del cliente; quejas por fallas en la facturación |
| [BQE Core](https://corehelpcenter.bqe.com/hc/en-us/articles/33553934495639-Project-Center-Budget) | Facturación por etapa; horas presupuestadas contra consumidas | Órdenes de cambio, que BQE no tiene | Precio a cotizar; cobro por transferencia solo en EE. UU. |
| [Mosaic](https://www.mosaicapp.com/) | Etapas con porcentaje del presupuesto consumido | Portal del cliente y puesta en marcha inmediata | Implementación de 30 a 60 días; sin precio público |
| [Weeker](https://www.weeker.es/) | Presupuestos por etapa; previsto contra real | Cambios aprobados por el cliente | España; 49,5 a 149,5 € según usuarios |
| [Fixner](https://www.fixner.com/) | Etapas, facturación por hito, portal del cliente | Órdenes de cambio, que Fixner no tiene | España; muy general (sirve a muchos rubros) |
| [Houzz Pro](https://pro.houzz.com/pro-help/r/creating-and-sending-change-orders) | El cambio cobra solo la diferencia; el cliente aprueba y firma desde un correo o SMS | Lo mismo, ligado a la etapa de honorarios | USD 199 por mes el plan con órdenes de cambio. Regla a copiar: si se edita el documento, se pierde la firma |
| [JobTread](https://www.jobtread.com/features/change-orders) | Cambios armados desde el presupuesto; el cliente aprueba por un link seguro | Igual, para honorarios de un estudio | USD 199 por mes más usuarios; portales de clientes y proveedores gratis e ilimitados |
| [Buildertrend](https://buildertrend.com/project-management/construction-change-order-software/) | Cambios que actualizan el presupuesto; el cliente firma en su portal | Español y pesos | Para constructoras; precio a cotizar |
| [Archdesk](https://archdesk.com/en-ca/solutions/change-order-management) | Precio y costo del cambio lado a lado; la aprobación pasa por varios niveles y termina con la firma del cliente | Versión para estudios, más simple | Externos gratis; precio a cotizar |
| [Procore](https://support.procore.com/products/online/user-guide/project-level/change-orders/tutorials/approve-or-reject-prime-contract-change-orders) | Eventos de cambio que se convierten en órdenes de cambio | Aprobación del cliente sin crearle una cuenta | Solo aprueba un usuario de Procore desde la web, no por correo ni desde la app |
| [Function Point](https://functionpoint.com/pricing) | Seguimiento de cambios y portal del cliente | Adaptado a arquitectura | Para agencias creativas; USD 53 a 68 por usuario por mes |

**Tres ideas para copiar:** la reserva que bloquea la unidad al instante (Urbantify, para la segunda etapa), la firma que se invalida si alguien edita la orden de cambio (Houzz Pro) y los invitados gratis e ilimitados (JobTread).

## Anexo B. Fuentes principales

- **Problema:** [FMI/PlanGrid, Construction Disconnected](https://www.autodesk.com/blogs/construction/construction-disconnected-fmi-report/) · [Deltek Clarity A&E 2025](https://www.deltek.com/en/about/media-center/press-releases/2025/what-the-46th-annual-deltek-clarity-ae-study-reveals-about-the-industry) · [Encuesta BIM Forum – CAMARCO 2023](https://elconstructor.com/el-bim-forum-argentina-y-camarco-comparten-los-resultados-de-la-encuesta-sobre-digitalizacion-del-sector) · [Ley 24.240](https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm) · [fallo por seña de US$20.000](https://estudiovilaplana.com.ar/2025/09/19/camara-civil-ordena-devolver-sena-de-usd-20-000-por-incumplimientos-en-proyecto-en-pozo/)
- **Mercado:** [Arquitectos en Córdoba](https://www.lavozdesanjusto.com.ar/nicolas-paulin-asumio-como-presidente-del-colegio-de-arquitectos-de-cordoba) · [CEDUC](https://ceduc.com.ar/socios-desarrollistas/) · [CEDU](https://www.cedu.com.ar/) · [IERIC, informe 251](https://www.ieric.org.ar/wp-content/uploads/2026/09/IERIC-Informe-Coyuntura-Construccion-No-251.pdf) · [INDEC, ISAC agosto 2026](https://www.indec.gob.ar/uploads/informesdeprensa/isac_10_2674E79F6A29.pdf)
- **Competencia y precios:** [Lebane](https://www.forbesargentina.com/negocios/crearon-software-gestionar-proyectos-construccion-acaban-levantar-us-4-millones-n86243) · [MOBU](https://mobu.market/negocios/desarrollos-inmobiliarios) · [Urbantify](https://www.urbantify.com/) · [Winbuild](https://mercado.com.ar/ruta-digital/winbuild-sumo-100-desarrolladoras-en-un-ano-con-tecnologia-para-proyectos-de-pozo) · [KiteProp](https://www.kiteprop.com/ar/plans) · [Colppy](https://www.colppy.com/precios/) · [Monograph](https://monograph.com/pricing) · [Houzz Pro](https://www.houzz.com/houzz-pro/pricing) · [JobTread](https://www.jobtread.com/pricing)
- **Infraestructura (precios al 15/10/2026):** [Vercel](https://vercel.com/pricing) · [Supabase](https://supabase.com/pricing) · [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) · [Resend](https://resend.com/pricing)
