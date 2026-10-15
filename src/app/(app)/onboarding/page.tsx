import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { OrganizationForm } from "../forms";

export const metadata: Metadata = { title: "Crear estudio" };

export default function OnboardingPage() {
  return (
    <div className="card mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Creá tu estudio</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Es el espacio donde van a vivir tus proyectos. Después podés sumar a tu equipo.
      </p>
      <Suspense fallback={<div className="h-24" />}>
        <Guard />
      </Suspense>
    </div>
  );
}

async function Guard() {
  await requireUser();
  if (await getCurrentOrg()) redirect("/proyectos");
  return <OrganizationForm />;
}
