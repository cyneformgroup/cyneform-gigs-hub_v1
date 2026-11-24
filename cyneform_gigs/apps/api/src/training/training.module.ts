import { Module } from "@nestjs/common";
import { PointsModule } from "../points/points.module";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
@Module({
  imports: [PointsModule],
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
