import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { PointsModule } from "../points/points.module";
import { ClaimsController } from "./claims.controller";
import { ClaimsService } from "./claims.service";
import { EventsConsumer } from "./events.consumer";
import { GigNotifier } from "./gig-notifier.service";
import { GigsController } from "./gigs.controller";
import { GigsService } from "./gigs.service";

@Module({
  imports: [MailModule, PointsModule],
  controllers: [GigsController, ClaimsController],
  providers: [GigsService, GigNotifier, ClaimsService, EventsConsumer],
  exports: [ClaimsService],
})
export class GigsModule {}
