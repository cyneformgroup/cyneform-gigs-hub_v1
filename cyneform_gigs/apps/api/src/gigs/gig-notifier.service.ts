import { and, asc, eq, inArray, isNull, leads, roles, users } from "@cyneform/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { decrypt } from "../common/crypto";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class GigNotifier {
  private readonly log = new Logger(GigNotifier.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async announce(leadIds: string[]) {
    if (leadIds.length === 0) return;
    const gigs = await this.db
      .select({ title: leads.title })
      .from(leads)
      .where(and(inArray(leads.id, leadIds), eq(leads.status, "new")))
      .orderBy(asc(leads.startsAt));
    if (gigs.length === 0) return;

    const n = gigs.length;
    const titles = gigs.slice(0, 5).map((g) => g.title);
    const title = `${n} new gig${n === 1 ? "" : "s"} available`;
    const codes = ["super_admin", "admin", "bdp"] as const;

    await this.notifications.notifyRoles([...codes], {
      type: "gigs.published",
      title,
      body: titles[0],
      link: "/gigs",
    });

    const people = await this.db
      .select({ emailCt: users.businessEmailCt })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(inArray(roles.code, [...codes]), eq(users.status, "active"), isNull(users.deletedAt)),
      );

    for (const p of people) {
      try {
        // Business email, as for the login OTP. Use the personal email here if you prefer.
        if (!p.emailCt) continue;
        await this.mail.sendTemplate(decrypt(p.emailCt), "new_gigs", {
          count: n,
          titles,
          url: `${env.APP_URL}/gigs`,
        });
      } catch (e) {
        this.log.error(`Gig announcement email failed: ${(e as Error).message}`);
      }
    }
  }
}
