// Planes y precios (hipótesis de la propuesta, a validar en la preventa).
export const PLANS = {
  estudio: { name: "Estudio", usd: 49, users: 5, projects: 10 as number | null, detail: "Hasta 5 usuarios internos y 10 proyectos activos" },
  pro: { name: "Estudio Pro", usd: 99, users: 15, projects: null as number | null, detail: "Hasta 15 usuarios y proyectos ilimitados, con reportes" },
} as const;
export type PaidPlan = keyof typeof PLANS;
export const PLAN_LABEL: Record<"trial" | PaidPlan, string> = { trial: "Prueba", estudio: "Estudio", pro: "Estudio Pro" };

export const TRIAL_DAYS = 30;
export const FOUNDER_OFFER = "Precio fundador: 50% durante 6 meses para los primeros 10 estudios.";
export const YEARLY_OFFER = "Pagando el año, dos meses gratis.";
