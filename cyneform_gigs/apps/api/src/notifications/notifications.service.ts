import { and, db, desc, eq, inArray, isNull, notifications, roles, sql, users } from "@cyneform/db";
import type { NotificationPage, NotificationType, RoleCode } from "@cyneform/types";
import { Injectable } from "@nestjs/common";

type NewNotification = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
};

@Injectable()
export class NotificationsService {
  async notify(userId: string, n: NewNotification) {
    await db.insert(notifications).values({
      userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    });
  }

  /** Everyone active in these roles (e.g. all admins). */
  async notifyRoles(codes: RoleCode[], n: NewNotification, exceptUserId?: string) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(inArray(roles.code, codes), eq(users.status, "active"), isNull(users.deletedAt)));
    const ids = rows.map((r) => r.id).filter((id) => id !== exceptUserId);
    if (ids.length === 0) return;
    await db.insert(notifications).values(
      ids.map((userId) => ({
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      })),
    );
  }

  async list(userId: string, limit: number): Promise<NotificationPage> {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    const [c] = await db
      .select({ unread: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        link: r.link,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      unread: Number(c?.unread ?? 0),
    };
  }

  async markRead(userId: string, id: string) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      );
  }

  async markAllRead(userId: string) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }
}
