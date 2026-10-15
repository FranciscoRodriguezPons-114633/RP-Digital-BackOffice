const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | string | null | undefined, currency: string) {
  if (amount === null || amount === undefined || amount === "") return "—";
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
    moneyFormatters.set(currency, f);
  }
  return f.format(Number(amount));
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
