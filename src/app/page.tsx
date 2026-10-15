import { Suspense } from "react";
import { redirect } from "next/navigation";
import { countGuestProjects, getCurrentOrg, getUser } from "@/lib/dal";

// La raíz solo decide adónde mandar a cada persona.
export default function Home() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Cargando…</p>}>
      <Router />
    </Suspense>
  );
}

async function Router() {
  if (!(await getUser())) redirect("/login");
  if (await getCurrentOrg()) redirect("/proyectos");
  if ((await countGuestProjects()) > 0) redirect("/proyectos");
  redirect("/onboarding");
  return null;
}
