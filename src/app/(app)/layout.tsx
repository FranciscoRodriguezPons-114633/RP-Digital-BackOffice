import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { getCurrentOrg, getUser, hasWorks } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/ui/toast";
import { AppNav, Brand } from "./sidebar-nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Escritorio: barra lateral oscura fija. Teléfono: barra superior y barra inferior. */}
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <Suspense fallback={null}>
            <TrialBanner />
          </Suspense>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

async function Sidebar() {
  const [user, org] = await Promise.all([getUser(), getCurrentOrg()]);
  return (
    <AppNav
      orgName={org?.name ?? null}
      email={user?.email ?? ""}
      isMember={!!org}
      toReview={org ? await countToReview(org.id) : 0}
      works={hasWorks(org)}
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
    <>
      <div className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 bg-nav px-3.5 py-5 md:flex" aria-hidden="true">
        <Brand orgName={null} />
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className={`block h-4 rounded bg-nav-raised ${i % 2 ? "w-28" : "w-36"}`} />
        ))}
      </div>
      <div className="flex bg-nav px-4 py-2.5 md:hidden">
        <Brand orgName={null} />
      </div>
    </>
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
      <div className="mx-auto max-w-6xl px-4 py-2 text-sm font-semibold text-warn md:px-8">
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
