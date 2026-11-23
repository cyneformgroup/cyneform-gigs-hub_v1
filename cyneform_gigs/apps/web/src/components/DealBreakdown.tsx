import type { DealItem } from "@cyneform/types";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;

export function DealBreakdown({ d }: { d: DealItem }) {
  const rows: [string, string, boolean?][] = [
    ["Project value", k(d.dealValue)],
    [`Month revenue after this deal (${d.month})`, k(d.cumulativeAfter)],
    [`Commission: tier ${d.tier} at ${d.commissionRate}%`, k(d.commissionAmount)],
    [`Points cashed in: ${d.pointsUsed} x ${k(d.kesPerPoint)}`, k(d.pointsValue)],
    ["Rollover from earlier deals", k(d.rolloverApplied)],
    ["Total before cap", k(d.totalBeforeCap), true],
    [`Cap: phase ${d.capPhase} at ${d.capRate}% of the project`, k(d.capAmount)],
    ["Your payout", k(d.finalPayout), true],
    [`Rolled over to your next deal`, k(d.rolloverCreated)],
  ];
  return (
    <dl className="mt-3 divide-y divide-slate-100 text-sm">
      {rows.map(([label, value, bold]) => (
        <div key={label} className="flex justify-between gap-3 py-1.5">
          <dt className="text-slate-600">{label}</dt>
          <dd className={bold ? "font-semibold" : ""}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
