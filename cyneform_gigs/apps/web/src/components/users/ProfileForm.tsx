import type { UpdateUserInput, UserDetail } from "@cyneform/types";
import { UpdateMeSchema, UpdateUserSchema } from "@cyneform/validators";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, api, messageOf } from "../../lib/api";
import { readForm } from "../../lib/form";
import { Alert, Button, Card, Field } from "../ui";

export function ProfileForm({ user, self = false }: { user: UserDetail; self?: boolean }) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: UpdateUserInput) =>
      api<UserDetail>(self ? "/me/profile" : `/users/${user.id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["user", user.id], updated);
      if (self) queryClient.setQueryData(["profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = readForm(e.currentTarget, self ? UpdateMeSchema : UpdateUserSchema);
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    save.mutate(result.data);
  }

  return (
    <Card className="mt-6">
      <h2 className="mb-4 font-semibold">{self ? "Contact details" : "Edit profile"}</h2>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {(errors._ || (save.error && !(save.error instanceof ApiError && save.error.fields))) && (
          <div className="sm:col-span-2">
            <Alert tone="error">{errors._ ?? messageOf(save.error)}</Alert>
          </div>
        )}
        {save.isSuccess && (
          <div className="sm:col-span-2">
            <Alert tone="success">Saved.</Alert>
          </div>
        )}
        {!self && (
          <Field
            label="Full name"
            name="fullName"
            defaultValue={user.fullName}
            error={errors.fullName}
          />
        )}
        <Field
          label="Phone"
          name="phone"
          defaultValue={user.phone ?? ""}
          placeholder="+254712345678"
          error={errors.phone}
        />
        <Field
          label="Location"
          name="location"
          defaultValue={user.location ?? ""}
          error={errors.location}
        />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
