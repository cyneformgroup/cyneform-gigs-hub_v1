import { Module } from "@nestjs/common";
import { PointsController } from "./points.controller";
import { PointsService } from "./points.service";
import { RulesController } from "./rules.controller";
import { RulesService } from "./rules.service";

@Module({
  controllers: [RulesController, PointsController],
  providers: [RulesService, PointsService],
  exports: [PointsService],
})
export class PointsModule {}
