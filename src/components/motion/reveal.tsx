import type { CSSProperties } from "react";

// Entrada de bloques (SPEC-animaciones §2.2). Dos formas, ambas definidas en globals.css:
// - className="reveal" style={reveal(n)}: el bloque n de la página (0, 1, 2…), de a
//   --stagger-block, de izquierda a derecha y de arriba abajo.
// - className="reveal-group" style={revealFrom(n)}: numera solos a sus hijos a partir de n.
//   Solo los primeros 12 llevan desenfoque y escalonado; el resto aparece con el último.
export const reveal = (i: number) => ({ "--i": i }) as CSSProperties;
export const revealFrom = (i: number) => ({ "--i0": i }) as CSSProperties;
