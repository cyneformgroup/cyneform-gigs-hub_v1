import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { EventsConsumer } from "./events.consumer";
import { GigNotifier } from "./gig-notifier.service";
import { GigsController } from "./gigs.controller";
import { GigsService } from "./gigs.service";

@Module({
  imports: [MailModule],
  controllers: [GigsController],
  providers: [GigsService, GigNotifier, EventsConsumer],
})
export class GigsModule {}
