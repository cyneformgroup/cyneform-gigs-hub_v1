import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button } from "./ui";

const nav = [
  { to: "/", label: "Dashboard", end: true, permission: undefined },
  { to: "/users", label: "Users", end: false, permission: "users.view" },
];

export function Layout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <p className="mb-6 text-lg font-semibold tracking-tight text-brand-700">CyneForm</p>
        <nav className="space-y-1">
          {nav
            .filter((item) => !item.permission || can(item.permission))
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
