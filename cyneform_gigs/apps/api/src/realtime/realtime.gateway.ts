import { Inject, Logger } from "@nestjs/common";
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { TicketService } from "./ticket.service";

@WebSocketGateway({
  path: "/socket.io",
  transports: ["websocket", "polling"],
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(@Inject(TicketService) private readonly tickets: TicketService) {}

  async handleConnection(client: Socket) {
    const t = client.handshake.auth?.ticket;
    const info = typeof t === "string" ? await this.tickets.consume(t) : null;
    if (!info) {
      client.emit("auth_error");
      client.disconnect(true);
      return;
    }
    await client.join(`user:${info.userId}`);
    if (info.live) await client.join("harvest");
    this.log.debug(`socket connected for ${info.userId}`);
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toHarvest(payload: unknown) {
    this.server?.to("harvest").emit("harvest", payload);
  }
}
