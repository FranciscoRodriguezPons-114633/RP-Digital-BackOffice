import { revalidatePath } from "next/cache";

// Las secciones de un proyecto (resumen, honorarios, órdenes, documentos, obra, presupuestos…)
// cuelgan del layout de /proyectos/[id] y el resumen junta datos de todas: después de guardar
// algo se revalida el layout entero. revalidatePath con un id literal y "layout" no alcanza a
// las páginas de abajo (sus etiquetas usan el patrón de la ruta), por eso va el patrón.
export function revalidateProjectPages() {
  revalidatePath("/proyectos/[id]", "layout");
}
