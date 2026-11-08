import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth";

export function RequireAuth({ permission }: { permission?: string }) {
  const { status, can } = useAuth();
  const location = useLocation();

  if (status === "loading") return <p className="p-8 text-sm text-slate-500">Loading…</p>;
  if (status === "anonymous")
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(permission)) {
    return (
      <p className="p-8 text-sm text-slate-600">
        Access denied. Ask your administrator if you need this.
      </p>
    );
  }
  return <Outlet />;
}
