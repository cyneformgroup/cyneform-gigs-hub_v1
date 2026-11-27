import { Global, Module } from "@nestjs/common";
import { HarvestSubscriber } from "./harvest.subscriber";
import { RealtimeController } from "./realtime.controller";
import { RealtimeGateway } from "./realtime.gateway";
import { TicketService } from "./ticket.service";

@Global()
@Module({
  controllers: [RealtimeController],
  providers: [TicketService, RealtimeGateway, HarvestSubscriber],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
