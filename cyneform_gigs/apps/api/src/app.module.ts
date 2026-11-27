import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";
import { AccessModule } from "./access/access.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CalendarModule } from "./calendar/calendar.module";
import { ErrorFilter } from "./common/errors";
import { CompensationModule } from "./compensation/compensation.module";
import { CrmModule } from "./crm/crm.module";
import { DatabaseModule } from "./database/database.module";
import { GigsModule } from "./gigs/gigs.module";
import { HealthController } from "./health/health.controller";
import { LeaveModule } from "./leave/leave.module";
import { MailModule } from "./mail/mail.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PointsModule } from "./points/points.module";
import { ReportsModule } from "./reports/reports.module";
import { RewardsModule } from "./rewards/rewards.module";
import { SettingsModule } from "./settings/settings.module";
import { SourcesModule } from "./sources/sources.module";
import { TrainingModule } from "./training/training.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuditModule,
    MailModule,
    AccessModule,
    AuthModule,
    UsersModule,
    LeaveModule,
    NotificationsModule,
    PointsModule,
    SettingsModule,
    SourcesModule,
    GigsModule,
    CrmModule,
    CompensationModule,
    TrainingModule,
    CalendarModule,
    RewardsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
