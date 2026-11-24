import { Controller, Headers, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../access/auth-user"; // use the exact import your login routes use
import { badRequest } from "../common/errors";
import { CalcomService } from "./calcom.service";

@Controller("webhooks")
export class CalcomController {
  constructor(@Inject(CalcomService) private readonly calcom: CalcomService) {}

  /** Public: Cal.com has no session. Trust comes from the HMAC signature, checked before anything else. */
  @Public()
  @Post("calcom")
  @HttpCode(200)
  async hook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("x-cal-signature-256") signature?: string,
  ) {
    if (!req.rawBody) throw badRequest("NO_BODY", "Missing body.");
    await this.calcom.handle(req.rawBody, signature);
    return { ok: true };
  }
}
