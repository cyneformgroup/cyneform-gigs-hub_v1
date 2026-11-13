import { and, db, eq, inArray, isNull, notifications, roles, users } from "@cyneform/db";

export async function notifyAdmins(n: { title: string; body?: string; link?: string }) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(
      and(
        inArray(roles.code, ["super_admin", "admin"]),
        eq(users.status, "active"),
        isNull(users.deletedAt),
      ),
    );
  if (rows.length === 0) return;
  await db.insert(notifications).values(
    rows.map((r) => ({
      userId: r.id,
      type: "system" as const,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    })),
  );
}
