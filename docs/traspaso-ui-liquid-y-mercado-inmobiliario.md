# Traspaso: interfaz «liquid» y aplicaciones en el mercado inmobiliario argentino

Actualizado: 11/11/2026 · Para: la IA (o persona) que siga este trabajo · Pedido por: Francisco

Complementa a [`propuesta-mvp-backoffice.md`](propuesta-mvp-backoffice.md), [`analisis-y-roadmap-finanzas-de-obra.md`](analisis-y-roadmap-finanzas-de-obra.md) y [`plan-sprints-finanzas-de-obra.md`](plan-sprints-finanzas-de-obra.md). No los reemplaza.

**Marcas:** **[V]** leído en la fuente citada o en el código · **[I]** inferencia o criterio propio · **[C]** validar con un profesional (contador, abogado) antes de construir · **[SV]** sin verificar: lo dice una fuente secundaria y no se contrastó. En la Parte B, **[M1]**, **[M2]**… remiten a la lista de fuentes de la sección 8.

---

## 0. Cómo usar este documento

1. Leé primero la sección 1 (el proyecto en una página) y las reglas de trabajo de la sección 1.3. Son obligatorias.
2. El documento tiene dos partes independientes. La **Parte A** (interfaz) termina en un plan por fases listo para implementar. La **Parte B** (mercado) termina en un ranking de aplicaciones y en lo que hay que validar antes de construir.
3. La sección 6 lista las decisiones que son de Francisco. No las tomes por él: preguntale.
4. La sección 7 es un prompt listo para pegar en la próxima sesión.
5. Nada de lo propuesto acá está implementado. El repo quedó en `main` = `be1c409`, sin cambios de código; este archivo es lo único que agregó esta sesión y está sin commitear.

---

## 1. El proyecto en una página

### 1.1 Qué es y para qué

**RP Digital BackOffice** (repo `AA-Backoffice`, en GitHub `RP-Digital-BackOffice`) es un SaaS multiempresa para **estudios de arquitectura de 2 a 15 personas**, primero en Córdoba. La frase de venta es: *«Cobrá cada cambio que te pide el cliente y que nadie trabaje con un plano viejo»*.

El posicionamiento es estrecho a propósito: **el sistema que sabe qué está vigente y cuánto cuesta cada cambio**. No es un ERP, ni un CRM, ni un software de obra. El MVP «calcula, ordena y avisa, pero nunca actúa ante un organismo ni mueve dinero» (propuesta, §4).

| Área | Qué hace hoy [V] |
| --- | --- |
| Plata del proyecto | Honorarios por etapa (fijo, por hora o mixto, en USD o ARS), horas desde el teléfono, ajuste por índice, órdenes de cambio numeradas |
| Aprobación | El cliente aprueba o rechaza una orden desde un link, sin cuenta; se guarda firmante, fecha, IP y huella del contenido. Panel «Lo recuperado» |
| Lo vigente | Planos con revisiones (una sola vigente), piezas dependientes que pasan a «a revisar», registro de envíos, comentarios con pin y rondas |
| Transversal | Vencimientos con avisos, historial, exportación a Excel, invitados externos gratis, planes con prueba de 30 días y cobro manual |

**Estado:** el MVP (sprints 0 a 5) está terminado, en `main` y con el CI en verde. **No está publicado** (no hay dominio ni proyecto en la nube; los pasos están en [`operacion.md`](operacion.md)) y **todavía no tiene clientes que paguen**. El envío real de correos nunca se probó. El módulo siguiente planificado es «Finanzas de obra» (65 sprints semanales; el Sprint 1 no empezó).

### 1.2 Stack

- Next.js 16.4 (App Router, `cacheComponents`, Server Actions) + Tailwind CSS 4 + Geist Sans y Geist Mono. **No hay librería de componentes ni de íconos.**
- Supabase: Postgres con RLS por `org_id`, Auth por enlace mágico, Storage, Edge Function `process-outbox` (correos por Resend).
- Pruebas: Vitest (65 tests) y pgTAP. CI en GitHub Actions.

### 1.3 Reglas de trabajo (obligatorias)

- **Next.js 16 tiene cambios incompatibles.** Antes de escribir código leé la guía que corresponda en `node_modules/next/dist/docs/` (lo exige `AGENTS.md`). Lo que lee cookies va dentro de `<Suspense>`. La protección de rutas está en `src/proxy.ts`.
- Francisco escribe en español rioplatense: respondele con voseo.
- **Pedile permiso antes de cada push, siempre.** Si estás en `main`, abrí una rama antes de commitear.
- El mensaje final de cada turno tiene que incluir en texto el resumen y la pregunta (suele seguir la sesión desde otro dispositivo).
- Servidor de desarrollo: configuración `dev` en `.claude/launch.json`, puerto 3000. Necesita Supabase local (`npx supabase start`). En `/login` hay botones de ingreso rápido de desarrollo: Ana (dueña), Beto (miembro) y Cliente invitado.
- Pruebas: `npx vitest run` y `npm run build`.

---

# Parte A · Interfaz

## 2. Cómo es la interfaz hoy

Lo que sigue sale de leer el código y de recorrer la app en local (escritorio 1280 px y teléfono 390 px) el 11/11/2026 [V].

**Identidad actual:** «papel, tinta y verde pino». Fondo crema `#f6f5f2`, superficies blancas, acento `#1f4e46`, todo plano con bordes de 1 px. Es sobria y legible, y se parece más a un documento que a una app.

| Aspecto | Estado | Dónde |
| --- | --- | --- |
| Tokens de color | 23 variables semánticas (`--surface`, `--line`, `--accent`, estados con su `-soft`), en claro y oscuro | `src/app/globals.css:5-55` |
| Modo oscuro | Solo por `prefers-color-scheme`; no hay selector en la app | `globals.css:30` |
| Componentes | Clases propias en `@layer components`: `.card`, `.input`, `.btn` (+ `-sm`, `-lg`, 4 variantes), `.pill` (7 estados), `.badge`, `.chip`, `.skeleton` | `globals.css:83-179` |
| Radios | Sin escala: `rounded-md` ×18, `rounded-full` ×9, `rounded-lg` ×7, `rounded-xl` ×3 | todo `src/` |
| Elevación | No hay sombras. La única es una línea de 1 px en el ítem activo de la barra lateral | `sidebar-nav.tsx` |
| Movimiento | Una sola transición (`transition-colors` en botones) y el pulso de los esqueletos | `globals.css` |
| Íconos | 8 trazos SVG escritos a mano, solo en la barra lateral | `src/app/(app)/sidebar-nav.tsx` |
| Números | Importes en Geist Mono: alinean bien en columnas | secciones del proyecto, `/recuperado` |
| Navegación | Barra lateral fija de 240 px (`bg-sunken`, borde derecho); en el teléfono, barra superior con botón «Menú» | `src/app/(app)/layout.tsx:12` |
| Contenido | Columna de `max-w-5xl`; el proyecto es **una sola página larga** con tarjetas apiladas (vencimientos, honorarios, órdenes de cambio, documentos, piezas, envíos) | `src/app/(app)/proyectos/[id]/` |
| Formularios | Se abren con `<details>` (26 usos): el triángulo nativo, sin animación. Los mensajes van en línea; no hay avisos flotantes | `src/components/disclosure.tsx`, `form.tsx` |
| Capas flotantes | No existen: ni diálogos, ni menús, ni popovers, ni paleta de comandos, ni atajos de teclado | — |

### Lo que está bien y hay que conservar

- Tokens semánticos con claro y oscuro, foco visible con teclado y objetivos táctiles de 40 px.
- Estados siempre con color + punto + texto (`.pill`), nunca solo color.
- Importes en fuente monoespaciada y alineados a la derecha.
- Formularios que funcionan sin JavaScript y no borran lo escrito ante un error (`useActionForm`).
- Textos en español rioplatense, cortos y concretos.

### Problemas detectados, por impacto

1. **La página del proyecto no da contexto al desplazarse.** Es un scroll largo sin encabezado fijo ni índice de secciones; para pasar de honorarios a envíos hay que recorrer todo.
2. **`<details>` como interacción principal.** Crear y editar se resuelve abriendo un triángulo en el lugar. Funciona, pero se ve utilitario y empuja el contenido.
3. **Sin jerarquía de profundidad.** Todo está en el mismo plano: no se distingue lo que es navegación de lo que es contenido.
4. **Sin movimiento.** Nada entra, sale ni confirma. Las acciones importantes (aprobar una orden, publicar una revisión) no tienen respuesta visual propia.
5. **Radios sin sistema.** Tres radios distintos conviven sin regla.
6. **En el teléfono, el título del proyecto se parte.** A 390 px, «Edificio Alba» queda en dos líneas al lado de los botones «Historial» y «Exportar a Excel».
7. **El modo oscuro no se puede elegir**, y no hay forma de pedir menos transparencia o movimiento desde la app.

## 3. Qué es Liquid Glass y qué no

Liquid Glass es el lenguaje visual que Apple presentó en junio de 2025 (iOS 26, macOS Tahoe 26). Lo que importa para este proyecto no es el efecto, sino sus reglas de uso.

### Reglas de Apple

- **Es una capa funcional, no un estilo para todo.** Va en controles y navegación (barras, barras laterales, barras de pestañas) que flotan sobre el contenido. La guía lo dice textual: no usarlo en la capa de contenido [V: HIG Materials].
- **Con moderación:** solo en los elementos funcionales más importantes, y sin apilar vidrio sobre vidrio [V: HIG Materials, Adopting Liquid Glass].
- **Dos variantes.** *Regular* difumina y ajusta la luminosidad del fondo; es la indicada cuando hay texto. *Clear* es muy translúcida y solo sirve sobre foto o video. Los elementos grandes, como una barra lateral, se vuelven más opacos para que se lean [V: HIG Materials, HIG Color].
- **El vidrio no tiene color propio.** Se tiñe solo la acción primaria o un indicador de estado [V: HIG Color].
- **Formas concéntricas:** el radio de una forma anidada sigue al de su contenedor [V: Adopting Liquid Glass].
- **Borde de scroll:** el contenido que pasa por debajo de una barra se difumina y pierde opacidad [V: Adopting Liquid Glass].

### Las críticas y lo que cambió Apple

- Nielsen Norman Group (10/10/2025) señaló bajo contraste sobre fondos cargados, controles que se confunden con el contenido y animación constante [V: NN/g].
- Apple respondió en iOS 26.1 (noviembre de 2025) con un ajuste Clear / Tinted; Tinted sube la opacidad y el contraste [V: MacRumors].
- En iOS 27 (junio de 2026) habría un control continuo de transparencia y mejor difusión sobre fondos complejos [SV: solo prensa, sin documentación de Apple].

### El precedente que más sirve: Linear

Linear llevó el material a su app de iOS y **no reprodujo la refracción**: en parte por un límite técnico y en parte porque, según ellos, dificulta la lectura de interfaces profesionales densas. Se quedó con el desenfoque, un degradado sutil, el brillo en el borde y un contorno sólido cuando el usuario pide más contraste [V: Linear]. Es el mismo caso que este backoffice.

### Conclusión para este proyecto [I]

El «toque liquid» se consigue con **cuatro cosas**: superficies de navegación translúcidas que flotan, profundidad (sombras suaves en dos capas), radios concéntricos y movimiento corto. **No** hace falta refracción ni aberración cromática, y los datos (tablas, importes, formularios) se quedan sobre superficies opacas.

## 4. Dirección propuesta: «papel y vidrio»

Mantener la identidad actual (papel, tinta, verde pino) como **capa de contenido** y sumar una **capa de vidrio** para todo lo que es navegación y acción. El contenido sigue siendo un documento legible; lo que lo rodea flota.

### 4.1 Principios

1. **El vidrio va en el marco, nunca en los datos.** Barra lateral, encabezados fijos, barra inferior del teléfono, menús, avisos y paleta de comandos. Filas, celdas, tarjetas de datos, campos y pastillas quedan opacos.
2. **Solo la variante «regular».** Fondo entre 60% y 80% opaco. Cuanto más grande la superficie, más opaca.
3. **El vidrio necesita algo detrás.** Sobre un fondo plano no se nota. Por eso hacen falta dos cambios de estructura: contenido que se desplace por debajo de barras fijas, y un fondo de página con una variación tonal muy suave.
4. **Un solo color de acento.** El verde pino se reserva para la acción primaria y el estado activo.
5. **Sobriedad en lo frecuente, deleite en lo infrecuente.** Cargar horas tiene que ser instantáneo y callado; aprobar una orden puede tener un momento propio.
6. **El estado opaco es el punto de partida.** El vidrio se activa solo si el navegador lo soporta y el usuario no pidió lo contrario.

### 4.2 Tokens y recetas

Son una propuesta **sin probar en el build** [I]. Los valores salen de rangos usados en la práctica (desenfoque de 12 a 30 px, saturación de 140% a 200%) y hay que ajustarlos mirando la pantalla.

```css
/* globals.css — sumar a :root (y sus equivalentes en el bloque oscuro) */
:root {
  /* Radios concéntricos: interior = exterior − separación */
  --radius-control: 10px;   /* botones, campos */
  --radius-card: 14px;      /* tarjetas de contenido */
  --radius-panel: 20px;     /* paneles flotantes: barra lateral, hojas, paleta */

  /* Elevación: siempre dos capas */
  --shadow-raised: 0 1px 2px rgb(28 27 25 / 0.05), 0 4px 12px rgb(28 27 25 / 0.06);
  --shadow-floating: 0 2px 4px rgb(28 27 25 / 0.06), 0 12px 32px rgb(28 27 25 / 0.12);

  /* Vidrio */
  --glass-solid: color-mix(in oklab, var(--surface) 94%, var(--background));
  --glass-bg: color-mix(in oklab, var(--surface) 72%, transparent);
  --glass-bg-large: color-mix(in oklab, var(--sunken) 82%, transparent);
  --glass-border: color-mix(in oklab, var(--foreground) 10%, transparent);
  --glass-highlight: rgb(255 255 255 / 0.6);   /* en oscuro: rgb(255 255 255 / 0.08) */
  --glass-filter: blur(16px) saturate(160%);

  /* Movimiento */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 150ms;
  --dur-base: 220ms;
}

@layer components {
  /* Punto de partida opaco. */
  .glass {
    background: var(--glass-solid);
    border: 1px solid var(--glass-border);
    box-shadow: inset 0 1px 0 var(--glass-highlight), var(--shadow-floating);
  }
  .glass-large { background: var(--glass-solid); }

  /* El vidrio se activa solo con soporte y sin pedido de menos transparencia. */
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    :root:not([data-transparency="reduced"]) .glass {
      background: var(--glass-bg);
      -webkit-backdrop-filter: var(--glass-filter);
      backdrop-filter: var(--glass-filter);
    }
    :root:not([data-transparency="reduced"]) .glass-large { background: var(--glass-bg-large); }
  }

  @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
    .glass, .glass-large {
      background: var(--glass-solid) !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
      border-color: var(--line-strong);
    }
  }
}
```

Notas para implementar:

- **`prefers-reduced-transparency` no existe en Safari y está apagado en Firefox** [V: caniuse, MDN]. Por eso hace falta el atributo `data-transparency="reduced"` en `<html>`, manejado por un ajuste propio de la app (junto al selector de modo claro/oscuro).
- Tailwind 4 trae `backdrop-blur-*`, `backdrop-saturate-*` y las variantes `motion-reduce`, `motion-safe`, `contrast-more` y `supports-[…]` [V: Tailwind]. No trae una variante para transparencia reducida.
- Seguí el patrón que ya usa el archivo (`@layer components` con clases propias). No sumes una librería de componentes para esto.
- **No uses `liquid-glass-react`** ni filtros SVG de desplazamiento: la refracción solo funciona en Chromium y no se ve en Safari ni en Firefox [V: kube.io, repo de la librería].

### 4.3 Dónde va el vidrio en esta app

| Superficie | Hoy | Propuesta | Archivo |
| --- | --- | --- | --- |
| Barra lateral (escritorio) | Columna pegada al borde, `bg-sunken` | Panel flotante con margen de 8 a 12 px, radio de panel, `.glass .glass-large` | `src/app/(app)/layout.tsx`, `sidebar-nav.tsx` |
| Navegación en el teléfono | Barra superior con botón «Menú» | Barra inferior flotante de vidrio con 4 destinos (Proyectos, A revisar, Horas, Más) | ídem |
| Encabezado del proyecto | Se va con el scroll | Fijo, de vidrio, con título, acciones e índice de secciones; el contenido pasa por debajo | `src/app/(app)/proyectos/[id]/page.tsx` |
| Encabezados de tabla | Estáticos | Fijos y **opacos**, con un degradado corto en el borde inferior | secciones del proyecto, `/recuperado` |
| Crear y editar | `<details>` en el lugar | Hoja o diálogo (`<dialog>` nativo) **opaco**, con el fondo atenuado y desenfocado | `src/components/disclosure.tsx` y los `*-forms.tsx` |
| Confirmaciones | Texto en línea | Aviso flotante de vidrio, abajo; el texto en línea se mantiene para errores de campo | `src/components/form.tsx` |
| Paleta de comandos (⌘K) | No existe | Panel de vidrio para saltar a un proyecto o crear una orden | nuevo |
| Página de aprobación del cliente | Tarjeta simple | Barra de acción inferior fija de vidrio con «Aprobar» y «Rechazar»; animación de confirmación | `src/app/aprobar/[token]/` |
| Página de producto `/` | Texto y tarjetas | Encabezado de vidrio, fondo con más carácter y una captura real del producto | `src/app/page.tsx` |
| Tarjetas de datos, filas, campos, pastillas | Opacas | **Siguen opacas.** Solo cambian radio y sombra | `globals.css` |

### 4.4 Movimiento

- Duraciones de 150 a 250 ms con salida suave (`ease-out`); nada por encima de 300 ms [V: Kowalski].
- Animar solo `transform` y `opacity`. **Nunca animar el desenfoque** ni usar `transition: all`.
- Botones: `scale(0.97)` al presionar. Entradas desde `scale(0.95)` o más, nunca desde 0 [V: Kowalski].
- Indicador de carga con retardo de 150 a 300 ms, para que no parpadee en respuestas rápidas [V: Vercel guidelines].
- Todo detrás de `motion-safe:` o con variante `motion-reduce:`.
- Para transiciones entre páginas, revisá primero qué ofrece Next.js 16 en `node_modules/next/dist/docs/` antes de sumar una dependencia.

### 4.5 Qué tomar de las apps de referencia

| App | Qué copiar | Fuente |
| --- | --- | --- |
| Linear | Barra lateral más tenue que el contenido; menos separadores e íconos («la estructura se siente, no se ve»); vidrio sin refracción | Linear, rediseño y refresh 2026 |
| Vercel / Geist | Números tabulares, un solo formato de moneda por contexto, radios concéntricos, sombras de dos capas, estado en la URL, UI optimista con «Deshacer» | Vercel Web Interface Guidelines |
| Stripe | Escala de color donde la distancia entre niveles garantiza el contraste; en las pastillas, texto y fondo suben juntos | Stripe, sistemas de color accesibles |
| Raycast | Barra de acciones que muestra el atajo al lado de cada acción: se aprende el teclado sin manual | Raycast |
| Family | Paneles contextuales en vez de pantallas completas; animar solo el número que cambia | Benji Taylor |

Mercury y Attio suelen citarse como referencia para saldos y tablas, pero no se encontró una fuente primaria [SV].

### 4.6 Accesibilidad y rendimiento

- **Contraste:** WCAG no define cómo medir texto sobre una superficie translúcida. Medí en la zona de peor contraste: 4,5:1 para texto y 3:1 para bordes, íconos y foco [V: WebAIM]. Las herramientas automáticas ignoran el desenfoque, así que hay que medir a mano contra el peor fondo real.
- **Rendimiento:** un `backdrop-filter` grande puede forzar a redibujar la página en cada scroll [V: Bugzilla 1732817]. Mantené el desenfoque por debajo de 20 px en superficies grandes y no más de 3 o 4 superficies de vidrio por pantalla [SV: consejo de blog, sin medición].
- **Trampas conocidas:** `backdrop-filter` solo ve lo que tiene directamente detrás; en Firefox falla con `position: sticky` si un ancestro tiene `overflow` y `border-radius` [V: Comeau]. Probá en Safari, Firefox y Chrome.

### 4.7 Plan por fases

Cada fase es una rama y un PR. Ninguna cambia lógica de negocio ni la base de datos.

| Fase | Qué incluye | Listo cuando |
| --- | --- | --- |
| **1. Fundaciones** | Tokens de radio, sombra, vidrio y movimiento; fondo de página con variación tonal; selector de tema (claro, oscuro, sistema) y de «reducir transparencia»; unificar radios en `.card`, `.btn`, `.input` | Las pantallas se ven igual de legibles que hoy, con radios y sombras consistentes en claro y oscuro |
| **2. Marco** | Barra lateral flotante; barra inferior en el teléfono; encabezado fijo del proyecto con índice de secciones; arreglo del título que se parte a 390 px | El contenido pasa por debajo del vidrio sin perder contraste; navegable solo con teclado |
| **3. Interacción** | Reemplazar `<details>` por hojas o diálogos en crear y editar; avisos flotantes; movimiento corto en botones, listas y cambios de estado | Los formularios siguen funcionando sin JavaScript y no pierden lo escrito ante un error |
| **4. Momentos** | Página de aprobación del cliente; página de producto; paleta de comandos | La aprobación se completa con una mano en un teléfono; ⌘K abre y cierra en menos de 200 ms |

**Criterios comunes a todas las fases:**

- `npm run build` y `npx vitest run` pasan.
- Capturas en claro, oscuro, 1280 px y 390 px, con y sin «reducir transparencia».
- Contraste medido a mano en el peor caso de cada superficie de vidrio.
- Probado en Safari, Firefox y Chrome, y con `prefers-reduced-motion`.

### 4.8 Qué no hacer

- Filas, celdas, tarjetas de datos o campos translúcidos.
- Refracción, aberración cromática o fondos de colores detrás de números.
- Vidrio dentro de vidrio.
- La variante «clear» en cualquier lado.
- Depender de `prefers-reduced-transparency` como única salvaguarda.
- Cambiar los textos, los estados o la lógica de las pantallas en el mismo PR que el rediseño.

---

# Parte B · Mercado inmobiliario argentino

## 5. Qué aplicaciones reales tiene el producto

Investigación hecha el 11/11/2026. Cada dato lleva su fuente entre corchetes (lista en la sección 8). Actualiza, no reemplaza, la competencia de la propuesta (§5) y del análisis (§2).

### 5.1 Estado del mercado (2025–2026)

| Tema | Dato | Fuente |
| --- | --- | --- |
| Actividad | ISAC de septiembre de 2026: +5,1% interanual, pero el año acumula +1,3% y la tendencia está en 0,0%. Permisos de agosto: −10,9% interanual | [M1] |
| Clima | El 62% de 407 profesionales reportó menor actividad (Estudio Construya, oct–nov 2025). CEDUC habla de «gran meseta» (15/10/2026) | [M2] [M3] |
| Costo en dólares | US$1.503 por m² en junio de 2026, contra unos US$1.050 en diciembre de 2023. Los márgenes están comprimidos | [M4] [M5] |
| Índice CAC | Agosto de 2026: +4,0% mensual y +22,2% en el año | [M6] |
| Escrituras, CABA | Enero–agosto de 2026: 41.583 (−2,3%). **Con hipoteca: 6.170 contra 9.341 un año antes (−34%)** | [M7] |
| Escrituras, Córdoba | Enero–septiembre de 2026: 39.782 actos (−9%). Solo el 3,1% de las ventas fue con hipoteca | [M8] [M9] |
| Cómo se financia | El desarrollista reemplaza al banco: anticipo de 30% a 50% y hasta 120 cuotas, en dólares o en pesos ajustados por CAC. La operación es bimonetaria | [M10] |
| Alquileres | Desde el DNU 70/2023, moneda y ajuste son libres | [M11] |

**Lectura [I]:** el mercado no crece, el costo en dólares subió cerca de 40% desde 2023 y el crédito bancario retrocede. Eso empuja dos cosas que el producto puede atender: **el comitente exige ver en qué se va la plata**, y **el que vende financia en cuotas ajustadas por CAC** y tiene que explicarlas.

### 5.2 Tres hechos legales que son oportunidades de producto [C]

1. **La cuota ajustada por CAC hay que informarla, no solo aplicarla.** Un juez de Neuquén (15/7/2026) condenó a una vendedora, con daño punitivo, por dejar de informar la cuota actualizada y después recalcularla hacia atrás. Dijo que el hecho de que el CAC sea un índice público no exime de informar [M12].
2. **En un fideicomiso al costo, la rendición no objetada queda aceptada.** La Cámara Comercial, Sala B (agosto de 2026), sostuvo que el comprador asume los mayores costos salvo culpa o dolo del fiduciario, y dio por aceptada la rendición que no se objetó dentro de los 30 días que fijaba el contrato [M13]. Quien pueda probar qué rindió, cuándo y que el otro lo recibió, está cubierto.
3. **La aprobación por link es firma electrónica.** Vale, pero sin presunción de autoría: si la desconocen, prueba quien la invoca (Ley 25.506, art. 288 CCyC) [M14]. El registro de quién, cuándo y sobre qué versión no es un extra: es el producto.

El producto ya tiene las tres piezas técnicas: el cálculo por índice (`fee_stage_summary`, `/indices`), el registro de envíos con huella y apertura, y la aprobación con huella del contenido. Faltaría llevarlas de honorarios a cuotas, certificados y rendiciones.

### 5.3 Actores y tamaño

| Actor | Dato | Fuente |
| --- | --- | --- |
| Arquitectos, país | Más de 100.000 matriculados (2022) | [M15] |
| Arquitectos, Córdoba | Más de 14.000, en 6 regionales (2024) | [M16] |
| Constructoras | 19.359 empleadores registrados, 13,6 puestos en promedio (febrero de 2026). Otra nota da 15.822 en abril: discrepancia sin resolver | [M17] |
| Desarrollistas, Córdoba | CEDUC: 46 socios según la propuesta; 51 más 13 adherentes según otra nota [SV] | propuesta §5, [M18] |
| Inmobiliarios, Córdoba | 4.341 matriculados (2026) | [M19] |

No existe un dato publicado de cuántos **estudios** de arquitectura hay.

**Dolores con evidencia:** la cuota CAC mal informada y las rendiciones de fideicomiso tienen jurisprudencia de 2026; el costo en dólares en alza con precio fijo está en la prensa [M5]. **Dolores sin evidencia cuantitativa:** los adicionales que el estudio no cobra y el trabajo con planos viejos, que son el corazón del MVP, siguen siendo anecdóticos en Argentina [SV]. Solo los valida la entrevista (ver [`guia-entrevistas.md`](guia-entrevistas.md)).

### 5.4 Qué usan hoy y dónde está el hueco

| Categoría | Quién | Precio | Qué deja libre |
| --- | --- | --- | --- |
| Finanzas de desarrolladoras | **Lebane**: presupuesto, contratos, compras, estimaciones con fondo de garantía, estados de cuenta por unidad. Más de 470 clientes en Latinoamérica, US$4 M levantados | No publica; venta con demo | Su sitio habla en términos mexicanos (SAT, CFDI, «estimaciones», Neodata). Apunta a empresas con varios proyectos, no a un equipo de 2 a 15 |
| Ventas de pozo | Winbuild (CRM y showroom, 150 clientes), Sperant (US$350 por mes) | Medio a alto | Nada sobre planos vigentes ni cambios aprobados |
| CRM inmobiliario | Tokko Broker y otros | US$80 a 300 por mes [SV] | Mercado saturado |
| Gestión de estudios | Monograph (US$25 a 55 por usuario) | En dólares, en inglés | Sin pesos, sin CAC, sin etapas locales. **No se encontró competidor local** |
| Contabilidad | Colppy: $128.500 a $310.900 por mes más IVA (noviembre de 2026), unos US$82 a 198 | Público, en pesos | Es la referencia de precio para una pyme |
| Lo que usa la mayoría | Excel, WhatsApp y Drive | Gratis | Todo lo que exige prueba o cálculo repetido |

Fuentes: [M20] [M21] [M22] [M23] [M24].

**Huecos para equipos de 2 a 15 personas [I]:**

1. Certificado de obra privada con ajuste por CAC, anticipo y fondo de reparo. Hoy se hace en Excel.
2. Presupuesto o adicional aprobado por link con evidencia, atado al certificado.
3. Cuota CAC **explicada** al comprador: índice base, índice actual y la cuenta. Es lo que piden los fallos.
4. Operación bimonetaria real (USD y ARS en el mismo contrato).
5. Rendición de una obra por administración al comitente, con constancia de recepción.
6. Precio público y alta sin demo.

### 5.5 Ranking de aplicaciones

Es criterio propio [I], armado con la evidencia de arriba. La columna «Lo refuta» dice qué dato lo tiraría abajo.

| # | Aplicación | Quién paga | Por qué ahora | En el roadmap | Lo refuta |
| --- | --- | --- | --- | --- | --- |
| 1 | **Estudios que dirigen o administran obras privadas** (casas, PH, locales): costos transparentes, adicionales y rendición al comitente | El estudio; se imputa a una obra de más de US$150.000 | El comitente exige trazabilidad con el costo en dólares en alza. Mismo usuario y canal que el MVP; sin competidor local | Finanzas de obra R1: ficha de obra con el papel de la empresa (sprint 1) | Que no quieran mostrarle los costos al cliente |
| 2 | **Constructoras chicas**: presupuesto aprobado por link y certificados con CAC, anticipo y fondo de reparo | La constructora; referencia Colppy, US$80 a 200 por mes | Hueco 1 y 2; universo de 15.000 a 19.000 empleadores | R1, sprints 4 a 14 | Que Lebane baje a pymes con precio público, o que el contador imponga su Excel |
| 3 | **Fideicomisos al costo y ventas financiadas**: portal del comprador con cuota explicada y estado de cuenta | El fiduciario o el desarrollista | Hipotecas −34% y financiación propia en alza; es el dolor mejor documentado | Oleada 6 (2028) | A favor: 3 a 5 fiduciarios cordobeses que paguen un piloto. En contra: ciclo de venta largo y exigencia legal para una sola persona |
| 4 | **Estudios de arquitectura** (el MVP actual) | El estudio | Es el mejor canal: base enorme y decide el dueño | Hecho | Que menos del 5% de los estudios que lo prueban pague |
| 5 | Desarrollistas: personalizaciones de unidades y postventa | La desarrolladora | Hueco real en postventa | No está | Winbuild o Lebane lo suman |
| 6 | Loteos en cuotas | El loteador | Los lotes son el 21,6% de las operaciones en Córdoba [M9] | No está | Demanda sin validar |
| 7 | Inmobiliarias y administradores de consorcios | — | — | — | Mercado saturado y mal encaje: **descartar** |

### 5.6 Qué significa para el producto [I]

- **El plan de Finanzas de obra ya apunta bien.** Las aplicaciones 1 y 2 son exactamente la primera versión vendible (R1). No hace falta cambiar el plan, sino validarlo con entrevistas antes del sprint 6.
- **El MVP es el canal, no necesariamente el ingreso.** La investigación estima que un estudio solo pagaría entre US$15 y 40 por mes, por debajo de los precios publicados (USD 49 y 99). Es una estimación sin datos propios: como no hay clientes que paguen, ninguna de las dos cifras está validada.
- **La aplicación 3 tiene el mejor «por qué ahora» y el peor encaje con una sola persona.** La propuesta la dejó afuera a propósito (§4, cuotas de boletos y fideicomisos). Una versión mínima que no mueve dinero —mostrar la cuota calculada y dejar constancia de que se informó— respeta la regla «calcula, ordena y avisa».
- **El contexto es de meseta.** Con actividad plana, vender ahorro y cobro («recuperá lo que no cobraste», «no pierdas un juicio por no informar») tiene más sentido que vender crecimiento.
- **Riesgo principal:** dispersión. La propuesta ya lo marcaba como probabilidad alta.

### 5.7 Qué validar antes de construir

| Hipótesis | Cómo probarla | Señal para seguir |
| --- | --- | --- |
| Los estudios que dirigen obra le mostrarían los costos al comitente | 5 entrevistas con la guía existente, sumando un bloque de obra | 3 de 5 ya lo hacen en Excel o lo harían |
| Una constructora chica pagaría por certificados con CAC | Mostrar un certificado de ejemplo a 5 constructoras | 2 piden usarlo en una obra real |
| Un fiduciario pagaría por «cuota explicada + estado de cuenta» | Ofrecer un piloto pago a 3 a 5 fiduciarios de Córdoba | Uno paga antes de que exista |
| Los precios USD 49 y 99 se sostienen | Publicar el MVP y medir la conversión de la prueba de 30 días | Más del 5% de los estudios activados paga |

### 5.8 Canales

- **Colegio de Arquitectos de Córdoba:** más de 14.000 matriculados. No se encontraron convenios de software vigentes; el precedente es el del Consejo de Ciencias Económicas con un proveedor [M25].
- **Proyectar Córdoba** (CEDUC y La Voz): más de 5.000 asistentes y más de 1.000 rondas de negocios en junio de 2026 [M26].
- **BATEV** (junio) y **Expo Real Estate** (agosto), en Buenos Aires [M27].
- **Contadores:** canal indirecto que ya usa Colppy.
- **WhatsApp primero:** Lebane opera por WhatsApp y Winbuild lo integra. El plan del MVP ya preveía avisos por WhatsApp más adelante.
- **Precio:** el SaaS local para pymes publica en pesos más IVA; el vertical cotiza en dólares. El producto hoy publica en dólares y factura en pesos.

---

## 6. Decisiones que son de Francisco

No las tomes por él. Preguntá antes de avanzar.

1. **Orden:** ¿publicar el MVP primero y rediseñar después, o al revés? Recomendación [I]: publicar primero. Sin la app en línea no hay conversión que medir, y las fases 1 y 2 del rediseño no bloquean la publicación.
2. **Navegación en el teléfono:** ¿acepta cambiar el botón «Menú» por una barra inferior?
3. **Dependencias:** hoy no hay librería de componentes ni de íconos. ¿Se mantiene esa regla en el rediseño?
4. **Segmento:** ¿se mantiene el plan de Finanzas de obra (aplicaciones 1 y 2) o se adelanta una prueba con fiduciarios (aplicación 3)?
5. **Siguen sin respuesta** las tres preguntas del plan de sprints: quién arma la biblioteca base de rendimientos, qué constructora sería socia de diseño y si las vacaciones caen el 28/12.
6. **Pendientes de publicación:** todavía no hay dominio. Sin dominio, los correos solo le llegan a él.
7. **Pendientes menores:** que un abogado revise `/terminos` y `/privacidad`; borrar las ramas locales ya mergeadas.

---

## 7. Prompt para la próxima sesión

> Copiá desde «Rol» hasta el final.

**Rol.** Sos un ingeniero de producto con criterio de diseño. Seguís el trabajo de una sesión anterior sobre el repo `AA-Backoffice` (RP Digital BackOffice). Respondé en español rioplatense, con voseo.

**Antes de hacer nada, leé:**

1. `AGENTS.md` y `README.md`.
2. `docs/traspaso-ui-liquid-y-mercado-inmobiliario.md` completo. Es la fuente de este trabajo.
3. `src/app/globals.css`, `src/app/(app)/layout.tsx`, `src/app/(app)/sidebar-nav.tsx` y `src/app/(app)/proyectos/[id]/page.tsx`.
4. La guía de Next.js que corresponda en `node_modules/next/dist/docs/` antes de escribir código.

**Primero preguntale a Francisco** cuál de estos dos caminos quiere, y las decisiones de la sección 6 que apliquen:

- **Camino A, interfaz:** implementar la **Fase 1** de la sección 4.7 (tokens de radio, sombra, vidrio y movimiento; fondo de página; selector de tema y de «reducir transparencia»; radios unificados). No toques la estructura de las pantallas ni la lógica. Abrí una rama, mostrá capturas en claro, oscuro, 1280 px y 390 px, y medí el contraste de cada superficie de vidrio contra su peor fondo.
- **Camino B, mercado:** preparar la validación de la sección 5.7: sumar a `docs/guia-entrevistas.md` un bloque para estudios que dirigen obra y otro para constructoras, y armar un certificado de obra de ejemplo (con CAC, anticipo y fondo de reparo) para mostrar en las entrevistas. Sin código de producto.

**Reglas:**

- Pedí permiso antes de cada push. Si estás en `main`, abrí una rama antes de commitear.
- El vidrio va solo en navegación y acciones; los datos quedan opacos (sección 4.1 y 4.8).
- No sumes dependencias sin preguntar.
- `npm run build` y `npx vitest run` tienen que pasar antes de dar algo por terminado.
- Los datos marcados **[SV]** no están verificados: no los uses como base de una decisión sin volver a la fuente.
- Terminá cada turno con un resumen en texto y la pregunta que le dejás a Francisco.

---

## 8. Fuentes

Todas se consultaron el 11/11/2026. Se volvieron a abrir en una segunda pasada: HIG Materials, Linear (vidrio), Colegio de Escribanos, el fallo de Neuquén, la nota sobre el fallo de la Cámara Comercial y el sitio de Lebane. El resto se leyó una sola vez.

### Interfaz

- HIG Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- HIG Color: https://developer.apple.com/design/human-interface-guidelines/color
- Adopting Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- NN/g, «Liquid Glass Is Cracked»: https://www.nngroup.com/articles/liquid-glass/
- MacRumors, iOS 26.1: https://www.macrumors.com/2025/11/03/ios-26-1-liquid-glass-toggle/
- MacRumors, iOS 27: https://www.macrumors.com/2026/06/10/how-liquid-glass-is-changing-in-ios-27/
- Linear, vidrio en iOS: https://linear.app/now/linear-liquid-glass
- Linear, rediseño: https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear, refresh 2026: https://linear.app/blog/behind-the-latest-design-refresh
- kube.io, refracción con SVG: https://kube.io/blog/liquid-glass-css-svg
- liquid-glass-react: https://github.com/rdev/liquid-glass-react
- Josh Comeau, backdrop-filter: https://www.joshwcomeau.com/css/backdrop-filter/
- caniuse, prefers-reduced-transparency: https://caniuse.com/mdn-css_at-rules_media_prefers-reduced-transparency
- MDN, prefers-reduced-transparency: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
- Bugzilla 1732817: https://bugzilla.mozilla.org/show_bug.cgi?id=1732817
- WebAIM, contraste: https://webaim.org/articles/contrast/
- Tailwind, backdrop blur: https://tailwindcss.com/docs/backdrop-filter-blur
- Tailwind, variantes: https://tailwindcss.com/docs/hover-focus-and-other-states
- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- Stripe, sistemas de color accesibles: https://stripe.com/blog/accessible-color-systems
- Raycast: https://raycast.com/blog/a-fresh-look-and-feel
- Benji Taylor, Family: https://benji.org/family-values
- Emil Kowalski, animación: https://emilkowal.ski/ui/7-practical-animation-tips

### Mercado

- [M1] ISAC, septiembre de 2026: https://mercado.com.ar/informes-especiales/construccion-el-isac-subio-51-interanual-en-septiembre-y-78-frente-a-agosto-pero-el-ano-acumula-13
- [M2] Estudio Construya: https://mercado.com.ar/ladrillos-y-proyectos/el-62-de-los-actores-de-la-construccion-reporto-menor-actividad-interanual-segun-el-estudio-construya
- [M3] CEDUC, «gran meseta»: https://www.perfil.com/noticias/amp/cordoba/desarrollistas-en-alerta-costos-altos-ventas-frenadas-y-poco-credito-hipotecario.phtml
- [M4] Costo por m² en dólares: https://www.lavozdesanjusto.com.ar/construir-en-la-argentina-volvio-a-encarecerse-el-costo-del-m2-supero-los-225-millones-y-rozo-maximos-en-dolares
- [M5] Rentabilidad en mínimos: https://www.iprofesional.com/realestate/452155-suben-los-costos-no-los-precios-la-rentabilidad-de-la-construccion-toca-niveles-minimos
- [M6] Índice CAC: https://mudafy.com.ar/d/indice-cac
- [M7] Colegio de Escribanos de CABA, agosto de 2026: https://www.colegio-escribanos.org.ar/?p=144575
- [M8] Escrituras en Córdoba: https://www.perfil.com/noticias/cordoba/escrituras-en-cordoba-caen-9-en-2026-y-el-tercer-trimestre-acentua-la-baja.phtml
- [M9] Radiografía del sector cordobés: https://www.perfil.com/noticias/cordoba/radiografia-del-sector-inmobiliario-cordobes-efecto-serrucho-barrera-del-credito-y-una-rentabilidad-que-tienta-a-inversores.phtml
- [M10] Financiación propia de desarrolladoras: https://www.cronista.com/negocios/del-pozo-a-la-cuota-la-nueva-estrategia-de-las-desarrolladoras-para-atraer-compradores/
- [M11] Alquileres tras la derogación: https://chequeado.com/el-explicador/alquileres-en-argentina-que-paso-con-los-precios-y-la-oferta-despues-de-la-derogacion-de-la-ley/
- [M12] Fallo de Neuquén, cuotas CAC: https://www.jusneuquen.gov.ar/condenan-a-una-empresa-por-calcular-retroactivamente-las-cuotas-de-un-departamento/
- [M13] Fallo CNCom Sala B, fideicomiso al costo: https://www.derechoenzapatillas.com/2026/fideicomiso-al-costo-por-que-el-precio-nunca-es-el-precio/
- [M14] Firma electrónica: https://abogados.com.ar/hacia-una-modernizacion-de-los-contratos/26737
- [M15] FADEA, matriculados: https://www.colegioarquitectos.org.ar/wp-content/uploads/2022/07/declaracion-presentada-por-fadea.pdf
- [M16] Colegio de Arquitectos de Córdoba: https://www.lavozdesanjusto.com.ar/nicolas-paulin-asumio-como-presidente-del-colegio-de-arquitectos-de-cordoba
- [M17] IERIC, empleadores: https://mercado.com.ar/ladrillos-y-proyectos/el-ieric-registro-352-742-empleos-formales-en-construccion-y-alza-interanual
- [M18] CEDUC, socios: https://infonegocios.info/y-ademas/arinco-y-macario-se-sumaron-a-la-ceduc
- [M19] Colegio de Inmobiliarios de Córdoba: https://infonegocios.info/default/lucas-pendola-asumio-la-presidencia-del-colegio-profesional-de-inmobiliarios-de-cordoba
- [M20] Lebane: https://lebane.app/ y https://www.forbesargentina.com/negocios/crearon-software-gestionar-proyectos-construccion-acaban-levantar-us-4-millones-n86243
- [M21] Winbuild: https://mercado.com.ar/ruta-digital/winbuild-sumo-100-desarrolladoras-en-un-ano-con-tecnologia-para-proyectos-de-pozo
- [M22] CRM inmobiliarios, precios estimados: https://developargentina.com/blog/software-inmobiliaria-argentina-2026
- [M23] Monograph, precios: https://www.cloudwards.net/monograph-review/
- [M24] Colppy, precios: https://www.colppy.com/precios
- [M25] Convenio del CPCE Córdoba: https://web.cpcecba.org.ar/?p=54488
- [M26] Proyectar Córdoba 2026: https://mercado.com.ar/eventos/proyectar-cordoba-2026-cerro-su-cuarta-edicion-con-mas-de-5-000-asistentes
- [M27] BATEV y Expo Real Estate: https://mercado.com.ar/agenda/batev-2026-se-realizara-en-la-rural-del-24-al-27-de-junio y https://mercado.com.ar/agenda/expo-real-estate-argentina-realizara-su-16-a-edicion-en-el-hilton-buenos-aires
