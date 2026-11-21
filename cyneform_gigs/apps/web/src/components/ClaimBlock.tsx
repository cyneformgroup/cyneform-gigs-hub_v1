import type { ActiveClaim } from "@cyneform/types";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Card } from "./ui";

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return (
    <span className="font-mono">
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function useMyClaims() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ["my-claims"],
    queryFn: () => api<ActiveClaim[]>("/gigs/claims/mine"),
    enabled: can("gigs.claim"),
    refetchInterval: 30_000,
  });
}

/** Spec LH-002 step 11: no leaving the Lead Harvester while a claim is unsent. */
export function ClaimBlock({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const claim = useMyClaims().data?.[0];
  if (claim && !pathname.startsWith("/gigs")) {
    return (
      <Card>
        <Alert tone="error">
          You have a claimed lead that hasn't been marked as outreach sent. Please mark it as sent
          or release it before proceeding.
        </Alert>
        <p className="mt-3 text-sm">
          {claim.title} · <Countdown to={claim.expiresAt} /> left ·{" "}
          <Link to="/gigs" className="text-blue-600 hover:underline">
            Go to Gigs
          </Link>
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}
