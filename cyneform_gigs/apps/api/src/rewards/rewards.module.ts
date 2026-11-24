import { Module } from "@nestjs/common";
import { BonusService } from "./bonus.service";
import { EquityService } from "./equity.service";
import { RewardsController } from "./rewards.controller";

@Module({
  controllers: [RewardsController],
  providers: [BonusService, EquityService],
  exports: [BonusService, EquityService],
})
export class RewardsModule {}
