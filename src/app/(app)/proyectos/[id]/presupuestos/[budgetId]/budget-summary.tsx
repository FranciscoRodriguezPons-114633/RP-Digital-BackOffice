import {
  COST_CLASSES,
  COST_CLASS_LABEL,
  FEES_MODE_LABEL,
  MARKUP_METHOD_LABEL,
  OVERHEAD_KIND_LABEL,
  type CostClass,
  type FeesMode,
  type MarkupMethod,
} from "@/lib/budgets";
import { formatMoney } from "@/lib/format";

// Totales de un presupuesto (vista budget_totals) y su resumen del costo directo al precio sin
// IVA. Lo usan el editor, la vista imprimible y el Excel: las tres muestran las mismas filas.

export type Totals = Record<CostClass, string | null> & {
  total: string;
  cost_per_m2: string | null;
  weighted_m2: string;
  items: number;
  items_unpriced: number;
  items_missing_rate: number;
  overheads_staff: string;
  overheads_indirect: string;
  overheads_unpriced: number;
  cost: string;
  overhead_pct: string;
  profit_pct: string;
  tax_pct: string;
  markup_method: MarkupMethod;
  overhead_amount: string;
  profit_amount: string;
  tax_amount: string;
  markup_amount: string;
  fees_mode: FeesMode;
  fees_amount: string;
  fees_taken_at: string | null;
  price: string;
  price_per_m2: string | null;
};

export const TOTALS_SELECT =
  "total, cost_per_m2, weighted_m2, materials, labor, equipment, subcontract, other, items, items_unpriced, items_missing_rate, " +
  "overheads_staff, overheads_indirect, overheads_unpriced, cost, overhead_pct, profit_pct, tax_pct, markup_method, " +
  "overhead_amount, profit_amount, tax_amount, markup_amount, fees_mode, fees_amount, fees_taken_at, price, price_per_m2";

export type SummaryLine = { label: string; amount: number; share?: string; strong?: boolean };

// Las filas del resumen. Las que dan cero no se muestran (salvo costo directo y precio).
export function summaryLines(totals: Totals): SummaryLine[] {
  const n = (v: string | null | undefined) => Number(v ?? 0);
  const direct = n(totals.total);
  const staff = n(totals.overheads_staff);
  const indirect = n(totals.overheads_indirect);
  const pct = (v: string) => `${String(Number(v)).replace(".", ",")} %`;
  const lines: SummaryLine[] = COST_CLASSES.map((c) => ({ c, amount: n(totals[c]) }))
    .filter((p) => p.amount !== 0)
    .map((p) => ({
      label: COST_CLASS_LABEL[p.c],
      amount: p.amount,
      share: direct > 0 ? `${((p.amount / direct) * 100).toFixed(1).replace(".", ",")} %` : undefined,
    }));
  lines.push({ label: "Costo directo", amount: direct, strong: true });
  if (staff !== 0) lines.push({ label: OVERHEAD_KIND_LABEL.staff, amount: staff });
  if (indirect !== 0) lines.push({ label: OVERHEAD_KIND_LABEL.indirect, amount: indirect });
  if (staff !== 0 || indirect !== 0) lines.push({ label: "Costo", amount: n(totals.cost), strong: true });
  const markup = [
    { label: `Gastos generales (${pct(totals.overhead_pct)})`, amount: n(totals.overhead_amount) },
    { label: `Beneficio (${pct(totals.profit_pct)})`, amount: n(totals.profit_amount) },
    { label: `Impuestos (${pct(totals.tax_pct)}, a validar)`, amount: n(totals.tax_amount) },
  ].filter((r) => r.amount !== 0);
  lines.push(...markup);
  if (markup.length > 0) {
    lines.push({
      label: `Pase (${MARKUP_METHOD_LABEL[totals.markup_method].toLowerCase()})`,
      amount: n(totals.markup_amount),
      strong: true,
    });
  }
  const fees = n(totals.fees_amount);
  if (fees !== 0) lines.push({ label: `Honorarios (${FEES_MODE_LABEL[totals.fees_mode].toLowerCase()})`, amount: fees });
  lines.push({ label: "Precio sin IVA", amount: n(totals.price), strong: true });
  return lines;
}

export function SummaryTable({ totals, currency, className = "" }: { totals: Totals; currency: string; className?: string }) {
  return (
    <table className={`w-full border-collapse text-sm ${className}`}>
      <tbody>
        {summaryLines(totals).map((l) => (
          <tr key={l.label} className={l.strong ? "border-t border-line font-semibold" : ""}>
            <th scope="row" className={`py-1.5 pr-4 text-left ${l.strong ? "" : "font-normal text-subtle"}`}>
              {l.label}
            </th>
            <td className="py-1.5 pr-4 text-right font-mono whitespace-nowrap">{formatMoney(l.amount, currency)}</td>
            <td className="w-16 py-1.5 text-right text-xs whitespace-nowrap text-muted">{l.share ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

