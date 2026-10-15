import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { DevLogin } from "./dev-login";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold">Ingresar</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          Te mandamos un enlace por correo. Sin contraseñas.
        </p>
        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>
        <DevLogin />
      </div>
    </main>
  );
}
