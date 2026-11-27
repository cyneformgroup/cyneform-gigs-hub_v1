import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LifecycleService } from "./lifecycle.service";

@Module({
  imports: [AuditModule, MailModule, NotificationsModule],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class AutomationModule {}
