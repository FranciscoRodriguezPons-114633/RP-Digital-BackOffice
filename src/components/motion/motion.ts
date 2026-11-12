// Utilidades de los componentes de movimiento que corren en el cliente.

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Lee un token de tiempo de globals.css («900ms» o «0.9s») en milisegundos.
export function readTime(el: Element, token: string) {
  const raw = getComputedStyle(el).getPropertyValue(token).trim();
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return raw.endsWith("ms") ? n : raw.endsWith("s") ? n * 1000 : n;
}

// La curva de --ease-data (≈ easeOutExpo), para lo que se anima con requestAnimationFrame.
export const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

// Umbral de entrada en pantalla de los datos que quedan debajo del pliegue (§7).
export const IN_VIEW_THRESHOLD = 0.3;
