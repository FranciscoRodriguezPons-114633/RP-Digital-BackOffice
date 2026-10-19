import Link from "next/link";
import type { ReactNode } from "react";

// Página legal con el aviso de borrador: el plan pide que un abogado revise estos textos
// antes de lanzar. Sacar el aviso recién cuando estén revisados.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:underline">← RP Backoffice</Link>
      <div role="note" className="rounded-md border border-warn bg-surface p-4 text-sm text-warn">
        Borrador: este texto tiene que revisarlo un abogado antes del lanzamiento. No es un texto legal definitivo.
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">Última actualización: {updated}</p>
      <div className="flex flex-col gap-4 text-sm leading-relaxed [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-medium">{children}</div>
    </main>
  );
}
