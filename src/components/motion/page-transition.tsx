import { ViewTransition, type ReactNode } from "react";

// Contenedor raíz de una página con salida animada (SPEC-animaciones §2.3): lo viejo se va con
// opacidad y desenfoque en --dur-fast. La entrada la hacen las animaciones CSS de cada bloque.
// Va en cada page.tsx, nunca en el layout: los layouts persisten y no disparan enter/exit.
// default="none" evita que router.refresh() (lo llaman las server actions vía revalidatePath)
// vuelva a animar.
export function PageTransition({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ViewTransition exit="page-exit" enter="none" default="none">
      <div className={className}>{children}</div>
    </ViewTransition>
  );
}
