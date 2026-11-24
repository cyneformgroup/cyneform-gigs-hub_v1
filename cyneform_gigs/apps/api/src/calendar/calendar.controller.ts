import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { CreateMeetingDto, MarkAttendanceDto, MeetingQueryDto } from "./calendar.dto";
import { CalendarService } from "./calendar.service";

@Controller("calendar")
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}
  @RequirePermissions("calendar.view")
  @Get()
  list(@Query() query: MeetingQueryDto, @CurrentUser() actor: AuthUser) {
    return this.calendar.list(actor, query.from, query.to);
  }
  @RequirePermissions("calendar.manage")
  @Post()
  create(@Body() dto: CreateMeetingDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.calendar.create(dto, actor, clientInfo(req));
  }
  @RequirePermissions("calendar.manage")
  @Post(":id/cancel")
  @HttpCode(204)
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.calendar.cancel(id, actor, clientInfo(req));
  }
  @RequirePermissions("calendar.view")
  @Post(":id/attendance")
  @HttpCode(204)
  attendance(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.calendar.attendance(id, dto.userId, dto.attended, actor, clientInfo(req));
  }
}
