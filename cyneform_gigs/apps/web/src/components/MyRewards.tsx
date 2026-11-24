import type { BonusItem, MyEquity } from "@cyneform/types";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge, Card } from "./ui";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;
export function MyRewards() {
  const bonus = useQuery({
    queryKey: ["bonus-mine"],
    queryFn: () => api<BonusItem[]>("/bonus/mine"),
  });
  const equity = useQuery({
    queryKey: ["equity-mine"],
    queryFn: () => api<MyEquity>("/equity/mine"),
  });
  const grant = equity.data?.grant;
  if (!bonus.data?.length && !grant) return null;
  return (
    <Card>
      <h2 className="font-semibold">My rewards</h2>
      {bonus.data?.map((item) => (
        <p key={item.id} className="mt-2 text-sm">
          Performance bonus: <b>{k(item.liquidatedAmount ?? item.amount ?? 0)}</b>{" "}
          <Badge value={item.status} />
        </p>
      ))}
      {grant && (
        <div className="mt-3 text-sm">
          <p>
            Phantom equity: <b>{grant.percentage}%</b> of appreciation,{" "}
            <b>{grant.vestedPercent}% vested</b>. Cliff date{" "}
            {new Date(grant.cliffDate).toLocaleDateString("en-KE")}. Baseline{" "}
            {k(grant.baselineValuation)}.
          </p>
          <ul className="mt-1">
            {equity.data?.payouts.map((p) => (
              <li key={p.id}>
                {p.milestoneName}: {k(p.amount)} <Badge value={p.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
