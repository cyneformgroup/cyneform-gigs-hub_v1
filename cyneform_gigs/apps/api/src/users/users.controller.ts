import { PERMISSIONS } from "@cyneform/validators";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type {
  ChangeStatusDto,
  CreateUserDto,
  PageQueryDto,
  SetOverridesDto,
  UpdateUserDto,
} from "./users.dto";
import { UsersService } from "./users.service";

@Controller()
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @RequirePermissions("users.view")
  @Get("users")
  list(@Query() q: PageQueryDto) {
    return this.users.list(q);
  }

  @RequirePermissions("users.create")
  @Post("users")
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.users.provision(dto, actor, clientInfo(req));
  }

  @RequirePermissions("users.view")
  @Get("users/:id")
  detail(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.detail(id, actor, clientInfo(req));
  }

  @RequirePermissions("users.create")
  @Post("users/:id/invite")
  @HttpCode(204)
  invite(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.resendInvite(id, actor, clientInfo(req));
  }

  @RequirePermissions("permissions.grant")
  @Put("users/:id/permissions")
  setPermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetOverridesDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.setOverrides(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("users.edit")
  @Patch("users/:id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("users.manage_status")
  @Post("users/:id/status")
  @HttpCode(200)
  changeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.users.changeStatus(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("users.view")
  @Get("users/:id/status-history")
  history(@Param("id", ParseUUIDPipe) id: string) {
    return this.users.history(id);
  }

  @RequirePermissions("permissions.view")
  @Get("permissions")
  catalogue() {
    return { permissions: PERMISSIONS };
  }
}
