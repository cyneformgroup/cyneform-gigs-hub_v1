import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { closeSocket } from "../lib/realtime";
import { useLiveNotifications } from "../lib/useLive";
import { ClaimBlock } from "./ClaimBlock";
import { NotificationBell } from "./NotificationBell";
import { Button } from "./ui";

const nav = [
  { to: "/dashboard", label: "Dashboard", end: true, any: ["dashboard.view"] },
  { to: "/reports", label: "Weekly report", end: true, any: ["reports.submit_own"] },
  { to: "/reports/admin", label: "Reports", any: ["reports.view_all"] },
  { to: "/privacy", label: "Privacy", any: ["privacy.self"] },
  { to: "/privacy/requests", label: "Data requests", any: ["privacy.manage"] },
  { to: "/users", label: "Users", end: false, any: ["users.view"] },
  {
    to: "/leave",
    label: "Leave",
    end: false,
    any: ["leave.request", "leave.view_all"],
  },
  { to: "/profile", label: "My profile", end: false, any: [] as string[] },
  { to: "/settings", label: "Settings", end: false, any: ["settings.manage"] },
  { to: "/sources", label: "Sources", any: ["sources.view"] },
  { to: "/gigs", label: "Gigs", any: ["gigs.view"] },
  { to: "/training", label: "Training", any: ["training.view"] },
  { to: "/calendar", label: "Calendar", any: ["calendar.view"] },
  { to: "/crm", label: "CRM", any: ["crm.view_own", "crm.view_all"] },
  { to: "/compensation", label: "My compensation", end: true, any: ["compensation.view_own"] },
  { to: "/compensation/admin", label: "Compensation admin", any: ["compensation.view_all"] },
  { to: "/rewards/bonus", label: "Performance bonus", any: ["bonus.view_all"] },
  { to: "/rewards/equity", label: "Phantom equity", any: ["equity.view_all"] },
  { to: "/points", label: "My points", end: true, any: ["points.view_own"] },
  { to: "/points/admin", label: "Points admin", any: ["points.view_all"] },
  { to: "/points/rules", label: "Points rules", any: ["rules.view"] },
];

export function Layout() {
  useLiveNotifications();
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    closeSocket();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <p className="mb-6 text-lg font-semibold tracking-tight text-brand-700">CyneForm</p>
        <nav className="space-y-1">
          {nav
            .filter((item) => item.any.length === 0 || item.any.some((p) => can(p)))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <NotificationBell />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-right text-sm">
            <p className="font-medium">{user?.fullName}</p>
            <p className="text-xs capitalize text-slate-500">{user?.role.replace("_", " ")}</p>
          </div>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-6">
          <ClaimBlock>
            <Outlet />
          </ClaimBlock>
        </main>
      </div>
    </div>
  );
}
