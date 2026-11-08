import type { CreateUserInput, UserPage, UserSummary } from "@cyneform/types";
import { CreateUserSchema } from "@cyneform/validators";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Field, PageHeader, SelectField } from "../components/ui";
import { ApiError, api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";
import { readForm } from "../lib/form";

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (input: CreateUserInput) =>
      api<UserSummary>("/users", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = readForm(e.currentTarget, CreateUserSchema);
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    create.mutate(result.data);
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-4 font-semibold">Add a user</h2>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {create.error && !(create.error instanceof ApiError && create.error.fields) && (
          <div className="sm:col-span-2">
            <Alert tone="error">{messageOf(create.error)}</Alert>
          </div>
        )}
        <Field label="Full name" name="fullName" error={errors.fullName} />
        <SelectField label="Role" name="role" defaultValue="bdp" error={errors.role}>
          <option value="bdp">BDP</option>
          {can("users.manage_admins") && <option value="admin">Admin</option>}
        </SelectField>
        <Field
          label="Business email"
          name="businessEmail"
          type="email"
          error={errors.businessEmail}
          hint="Used to sign in"
        />
        <Field
          label="Personal email"
          name="personalEmail"
          type="email"
          error={errors.personalEmail}
          hint="Receives the invite and sign-in codes"
        />
        <Field label="Phone" name="phone" placeholder="+254712345678" error={errors.phone} />
        <Field label="Location" name="location" error={errors.location} />
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create and send invite"}
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function Users() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", page, search],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (search) params.set("search", search);
      return api<UserPage>(`/users?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Users"
        action={
          can("users.create") && !adding ? (
            <Button onClick={() => setAdding(true)}>Add user</Button>
          ) : undefined
        }
      />
      {adding && <CreateUserForm onDone={() => setAdding(false)} />}

      <Card className="p-0">
        <form
          className="border-b border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(String(new FormData(e.currentTarget).get("q") ?? "").trim());
          }}
        >
          <input
            name="q"
            placeholder="Search by name and press Enter"
            className="w-full max-w-sm rounded-md px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
          />
        </form>

        {error && (
          <div className="p-4">
            <Alert tone="error">{messageOf(error)}</Alert>
          </div>
        )}
        {isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}

        {data && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/users/${u.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {u.fullName}
                    </Link>
                    <p className="text-xs text-slate-500">{u.businessEmail}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{u.contractorNumber}</td>
                  <td className="px-4 py-3 capitalize">{u.role.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <Badge value={u.passwordSet ? u.status : "pending"} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-KE") : "Never"}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm text-slate-600">
          <span>{data?.total ?? 0} people</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
