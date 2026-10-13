import { kg, naira, pts } from "@/lib/format";
import { materialLabel, type PickupItem } from "@/lib/types";

// Material · kg · ₦/kg · points; deductions in amber, indented; forest total row (DESIGN_BRIEF.md §7).
export function WeightTable({ items, totalKg, totalKobo }: { items: PickupItem[]; totalKg: string | null; totalKobo: number | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="eyebrow bg-canvas text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Material</th>
            <th className="px-2 py-2.5 text-right font-semibold">kg</th>
            <th className="px-2 py-2.5 text-right font-semibold">₦/kg</th>
            <th className="px-4 py-2.5 text-right font-semibold">Points</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {items.map((item) => (
            <ItemRows key={item.material} item={item} />
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-4 py-4 text-white" style={{ background: "linear-gradient(135deg, #14532D, #052E16)" }}>
        <span>
          <span className="eyebrow block text-[#BBF7D0]">Total</span>
          <span className="tabular text-sm text-[#DCFCE7]">{kg(totalKg)} net</span>
        </span>
        <span className="text-right">
          <span className="font-display text-3xl font-extrabold tracking-[-0.03em]">
            {totalKobo !== null ? pts(totalKobo).replace(" pts", "") : "–"}
            <small className="ml-1 text-base text-gold">pts</small>
          </span>
          {totalKobo !== null && <span className="tabular block text-xs text-[#BBF7D0]">{naira(totalKobo)}</span>}
        </span>
      </div>
    </div>
  );
}

function ItemRows({ item }: { item: PickupItem }) {
  const deducted = Number(item.deduction_kg) > 0;
  return (
    <>
      <tr className="border-t border-subtle">
        <td className="px-4 py-3 font-sans font-bold">{materialLabel(item.material)}</td>
        <td className="px-2 py-3 text-right">{Number(deducted ? item.gross_kg : item.net_kg).toFixed(2)}</td>
        <td className="px-2 py-3 text-right">{item.price_kobo_per_kg / 100}</td>
        <td className="px-4 py-3 text-right font-semibold">{pts(item.amount_kobo).replace(" pts", "")}</td>
      </tr>
      {deducted && (
        <tr className="text-warn">
          <td className="py-1.5 pr-2 pl-8 font-sans text-xs" colSpan={2}>
            − {Number(item.deduction_kg).toFixed(2)} kg · {item.deduction_reason}
          </td>
          <td className="px-4 py-1.5 text-right text-xs" colSpan={2}>
            {Number(item.net_kg).toFixed(2)} kg paid
          </td>
        </tr>
      )}
    </>
  );
}
