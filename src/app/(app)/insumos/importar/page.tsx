import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CardSkeleton } from "@/components/skeleton";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { MAX_IMPORT_ROWS } from "@/lib/supplies";
import { ImportSuppliesForm } from "../../supply-forms";

export const metadata: Metadata = { title: "Importar insumos" };

export default function ImportSuppliesPage() {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/insumos" className="text-sm text-muted hover:underline">← Insumos</Link>
      <div>
        <h1 className="text-2xl font-semibold">Importar insumos desde Excel</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Cargá una lista de precios con la plantilla. Antes de importar ves qué filas entran y cuáles tienen errores.
          Si el código ya existe, se actualiza el precio y el anterior queda en el historial; el nombre y la unidad no
          se tocan. Hasta {MAX_IMPORT_ROWS.toLocaleString("es-AR")} filas por archivo.
        </p>
      </div>
      <Suspense fallback={<CardSkeleton label="Cargando…" lines={3} />}>
        <Import />
      </Suspense>
    </div>
  );
}

async function Import() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org || !hasWorks(org)) notFound();
  if (org.role !== "owner") {
    return <p className="text-sm text-muted">Las listas de precios las importa el dueño.</p>;
  }
  return (
    <>
      <section className="card flex flex-col items-start gap-3">
        <h2 className="font-medium">1. Descargá la plantilla</h2>
        <p className="text-sm text-muted">
          Columnas: tipo (material, mano de obra, equipo o personal), código, nombre, unidad, moneda (ARS o USD),
          precio, fecha y, si querés, el CUIT del proveedor (tiene que estar cargado en Terceros).
        </p>
        {/* Descarga un archivo: enlace común, sin navegación del cliente. */}
        <a href="/insumos/plantilla" download className="btn btn-secondary">
          Descargar plantilla
        </a>
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">2. Subí la lista</h2>
        <ImportSuppliesForm />
      </section>
    </>
  );
}
