import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md">
      <h1 className="text-xl font-semibold">No encontramos esta página</h1>
      <p className="mt-2 text-sm text-muted">
        Puede que el proyecto no exista o que no tengas acceso. Si te invitaron, revisá que hayas
        entrado con el mismo correo de la invitación.
      </p>
      <Link href="/proyectos" className="btn btn-primary mt-6">Ir a mis proyectos</Link>
    </div>
  );
}
