import { Module } from "@nestjs/common";
import { PointsModule } from "../points/points.module";
import { CalcomController } from "./calcom.controller";
import { CalcomService } from "./calcom.service";
import { CrmController } from "./crm.controller";
import { CrmService } from "./crm.service";
import { EvidenceService } from "./evidence.service";

@Module({
  imports: [PointsModule],
  controllers: [CrmController, CalcomController],
  providers: [CrmService, EvidenceService, CalcomService],
  exports: [CrmService],
})
export class CrmModule {}
