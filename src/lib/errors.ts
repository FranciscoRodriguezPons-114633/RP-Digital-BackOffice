// Traduce errores de Postgres/PostgREST a mensajes para el usuario.
type DbError = { code?: string; message?: string } | null | undefined;

export function dbErrorMessage(error: DbError): string {
  switch (error?.code) {
    case "42501":
      return "No tenés permiso para hacer esto.";
    case "22023":
      return "Algún dato no es válido.";
    case "23505":
      return "Eso ya existe.";
    case "23514":
      return "Revisá los datos: alguno no cumple el formato.";
    case "28000":
      return "Necesitás iniciar sesión.";
    default:
      return "Algo salió mal. Probá de nuevo en un momento.";
  }
}
