const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, decimals: 0 | 2) {
  const key = `${currency}:${decimals}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

// Sin centavos si el monto es redondo ("USD 16.800"); con dos decimales si no ("USD 5.563,20").
export function formatMoney(amount: number | string | null | undefined, currency: string) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return moneyFormatter(currency, hasCents ? 2 : 0).format(n);
}

const hoursFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function formatHours(hours: number | string | null | undefined) {
  if (hours === null || hours === undefined || hours === "") return "—";
  return `${hoursFormatter.format(Number(hours))} h`;
}

// Fecha de hoy en Córdoba como YYYY-MM-DD (para el valor por defecto de un <input type="date">).
export function todayInCordoba(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(now);
}

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// Una fecha de la base ("2026-10-15") sin correrla de día por la zona horaria.
export function formatDay(isoDate: string) {
  return dayFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

// Hoy y el inicio de la ventana de las últimas `days` jornadas (incluido hoy), en Córdoba.
export function recentWindow(days: number, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 86400000);
  return { today: todayInCordoba(now), since: todayInCordoba(since) };
}

const periodFormatter = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });

// "2026-07-01" → "jul 2026"
export function formatPeriod(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  return periodFormatter
    .format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
    .replace(".", "")
    .replace(" de ", " ")
    .replace(/^sept\b/, "sep");
}

const factorFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
export function formatFactor(current: number | string, base: number | string) {
  return `× ${factorFormatter.format(Number(current) / Number(base))}`;
}

const indexFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });
export function formatIndexValue(v: number | string) {
  return indexFormatter.format(Number(v));
}

// Suma montos de la base ("1800.55") en centavos enteros, para que los totales
// coincidan al centavo con la suma de las órdenes (sin errores de coma flotante).
export function sumAmounts(values: (number | string | null | undefined)[]) {
  const cents = values.reduce<number>((acc, v) => acc + Math.round(Number(v ?? 0) * 100), 0);
  return cents / 100;
}

const bytesFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// 1234567 → "1,2 MB"
export function formatBytes(bytes: number | string | null | undefined) {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${bytesFormatter.format(n / 1024)} KB`;
  return `${bytesFormatter.format(n / (1024 * 1024))} MB`;
}
