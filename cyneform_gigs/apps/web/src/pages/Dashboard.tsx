import { Card, PageHeader } from "../components/ui";
import { useAuth } from "../lib/auth";

export function Dashboard() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={`Welcome, ${user?.fullName.split(" ")[0]}`} />
      <Card>
        <h2 className="text-sm font-semibold text-slate-700">Your access</h2>
        <p className="mt-1 text-sm capitalize text-slate-500">
          Role: {user?.role.replace("_", " ")}
        </p>
        {user && user.permissions.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {user.permissions.map((p) => (
              <li
                key={p}
                className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-700"
              >
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No admin permissions. Your workspace will appear here as it is built.
          </p>
        )}
      </Card>
    </>
  );
}
