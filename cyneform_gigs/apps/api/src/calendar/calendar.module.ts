import { Module } from "@nestjs/common";
import { PointsModule } from "../points/points.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
@Module({
  imports: [PointsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
