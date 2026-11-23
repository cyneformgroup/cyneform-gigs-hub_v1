import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { PointsModule } from "../points/points.module";
import { CompensationController } from "./compensation.controller";
import { CompensationService } from "./compensation.service";

@Module({
  imports: [PointsModule, CrmModule],
  controllers: [CompensationController],
  providers: [CompensationService],
  exports: [CompensationService],
})
export class CompensationModule {}
