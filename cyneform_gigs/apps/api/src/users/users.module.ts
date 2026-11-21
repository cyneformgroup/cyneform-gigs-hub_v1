import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { AuthModule } from "../auth/auth.module";
import { GigsModule } from "../gigs/gigs.module";
import { MeController } from "./me.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [AccessModule, AuthModule, GigsModule],
  controllers: [UsersController, MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
