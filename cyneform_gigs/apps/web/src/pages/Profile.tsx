import type { UserDetail } from "@cyneform/types";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Card, PageHeader } from "../components/ui";
import { ProfileForm } from "../components/users/ProfileForm";
import { api, messageOf } from "../lib/api";

export function Profile() {
  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api<UserDetail>("/me/profile"),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error || !user) return <Alert tone="error">{messageOf(error)}</Alert>;

  const rows: [string, string][] = [
    ["Name", user.fullName],
    ["ID", user.contractorNumber],
    ["Business email", user.businessEmail],
    ["Personal email", user.personalEmail],
    ["Role", user.role.replace("_", " ")],
  ];

  return (
    <>
      <PageHeader title="My profile" action={<Badge value={user.status} />} />
      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <ProfileForm user={user} self />
    </>
  );
}
