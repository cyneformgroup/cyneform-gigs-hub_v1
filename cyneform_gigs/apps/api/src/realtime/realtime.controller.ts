import { Controller, Inject, Post } from "@nestjs/common";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { TicketService } from "./ticket.service";

@Controller("realtime")
export class RealtimeController {
  constructor(@Inject(TicketService) private readonly tickets: TicketService) {}

  @RequirePermissions("privacy.self")
  @Post("ticket")
  async ticket(@CurrentUser() actor: AuthUser) {
    return {
      ticket: await this.tickets.issue(actor.id, actor.permissions.has("sources.view")),
    };
  }
}
