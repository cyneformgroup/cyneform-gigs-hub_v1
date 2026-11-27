import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AccountsService } from "./accounts.service";
import { AutomationController } from "./automation.controller";
import { LifecycleService } from "./lifecycle.service";

@Module({
  imports: [AuditModule, MailModule, NotificationsModule],
  controllers: [AutomationController],
  providers: [LifecycleService, AccountsService],
  exports: [LifecycleService, AccountsService],
})
export class AutomationModule {}
