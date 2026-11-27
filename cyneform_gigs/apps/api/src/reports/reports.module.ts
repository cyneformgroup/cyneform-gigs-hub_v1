import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PointsModule } from "../points/points.module";
import { DashboardService } from "./dashboard.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PointsModule, AuditModule, MailModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, DashboardService],
  exports: [ReportsService],
})
export class ReportsModule {}
