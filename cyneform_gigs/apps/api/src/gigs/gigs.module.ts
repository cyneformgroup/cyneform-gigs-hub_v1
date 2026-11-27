import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { CompensationModule } from "../compensation/compensation.module";
import { CrmModule } from "../crm/crm.module";
import { MailModule } from "../mail/mail.module";
import { PointsModule } from "../points/points.module";
import { ReportsModule } from "../reports/reports.module";
import { RewardsModule } from "../rewards/rewards.module";
import { ClaimsController } from "./claims.controller";
import { ClaimsService } from "./claims.service";
import { EventsConsumer } from "./events.consumer";
import { GigNotifier } from "./gig-notifier.service";
import { GigsController } from "./gigs.controller";
import { GigsService } from "./gigs.service";

@Module({
  imports: [
    MailModule,
    PointsModule,
    CrmModule,
    CompensationModule,
    RewardsModule,
    CalendarModule,
    ReportsModule,
  ],
  controllers: [GigsController, ClaimsController],
  providers: [GigsService, GigNotifier, ClaimsService, EventsConsumer],
  exports: [ClaimsService],
})
export class GigsModule {}
