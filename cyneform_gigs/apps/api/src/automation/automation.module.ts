import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AccountsService } from "./accounts.service";
import { AutomationController } from "./automation.controller";
import { LifecycleService } from "./lifecycle.service";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [AuditModule, MailModule, NotificationsModule],
  controllers: [AutomationController],
  providers: [LifecycleService, AccountsService, PrivacyService],
  exports: [LifecycleService, AccountsService, PrivacyService],
})
export class AutomationModule {}
