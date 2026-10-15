import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-muted">La dirección no existe o cambió.</p>
        <Link href="/" className="btn btn-primary mt-6">Volver al inicio</Link>
      </div>
    </main>
  );
}
