import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/skeleton";
import { getCurrentOrg, getUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { Brand, SidebarNav } from "./sidebar-nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* En escritorio, barra lateral fija; en el teléfono, barra superior con menú desplegable. */}
      <aside className="border-b border-line bg-sunken md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <TrialBanner />
        </Suspense>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}

async function Sidebar() {
  const [user, org] = await Promise.all([getUser(), getCurrentOrg()]);
  return (
    <SidebarNav
      orgName={org?.name ?? null}
      email={user?.email ?? ""}
      isMember={!!org}
      toReview={org ? await countToReview(org.id) : 0}
    />
  );
}

// Piezas que quedaron «a revisar» porque se publicó una revisión nueva de su plano.
async function countToReview(orgId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("dependencies")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "to_review");
  return count ?? 0;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 md:px-5 md:pt-5 md:pb-4">
        <Brand orgName={null} />
      </div>
      <div className="hidden flex-col gap-3 px-5 md:flex" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 2 ? "w-24" : "w-32"}`} />
        ))}
      </div>
    </div>
  );
}

// Aviso de prueba por terminar o terminada (no bloquea: el estudio sigue trabajando).
async function TrialBanner() {
  const org = await getCurrentOrg();
  if (!org) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("org_plan_status", { p_org_id: org.id })
    .single<{ plan: string; trial_ends_at: string }>();
  if (!data || data.plan !== "trial") return null;
  const days = trialDaysLeft(data.trial_ends_at);
  if (days > 7) return null;
  return (
    <div className="border-b border-warn/30 bg-warn-soft">
      <div className="mx-auto max-w-5xl px-4 py-2 text-sm text-warn md:px-8">
        {days > 0 ? `Te quedan ${days} ${days === 1 ? "día" : "días"} de prueba.` : "Terminó tu prueba."}{" "}
        <Link href="/plan" className="underline">
          {org.role === "owner" ? "Pasá a un plan" : "Avisale al dueño del estudio"}
        </Link>
      </div>
    </div>
  );
}

// Server Component: se renderiza una vez por pedido, después de leer cookies.
function trialDaysLeft(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
