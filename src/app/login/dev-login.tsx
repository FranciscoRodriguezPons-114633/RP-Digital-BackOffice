import { DEV_LOGIN_ENABLED, DEV_USERS } from "@/lib/env";
import { devSignIn } from "./dev-actions";

export function DevLogin() {
  if (!DEV_LOGIN_ENABLED) return null;
  return (
    <form action={devSignIn} className="mt-6 flex flex-col gap-2 border-t border-line pt-5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">Solo en desarrollo</p>
      {DEV_USERS.map((u) => (
        <button key={u.email} type="submit" name="email" value={u.email} className="btn btn-ghost justify-start border border-line">
          Entrar como {u.label}
        </button>
      ))}
      <p className="text-xs text-muted">
        Si no funciona, corré <code>npx supabase db reset</code> para cargar los usuarios de prueba.
      </p>
    </form>
  );
}
