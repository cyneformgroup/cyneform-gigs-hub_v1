import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { type AuthUser, CurrentUser } from "../access/auth-user";
import type { NotificationQueryDto } from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() q: NotificationQueryDto, @CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id, q.limit);
  }

  @Post("read-all")
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(":id/read")
  @HttpCode(204)
  read(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.id, id);
  }
}
