import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { LeaveController } from "./leave.controller";
import { LeaveService } from "./leave.service";

@Module({
  imports: [UsersModule],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
