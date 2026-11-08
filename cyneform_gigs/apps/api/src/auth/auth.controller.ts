import type { AuthSession, LoginResponse, SessionUser } from "@cyneform/types";
import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { type AuthUser, CurrentUser, Public } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import { AUTH, env } from "../config/env";
import type { ForgotPasswordDto, LoginDto, SetPasswordDto, VerifyOtpDto } from "./auth.dto";
import type { AuthService, IssuedSession } from "./auth.service";

const COOKIE = "rt";
const COOKIE_PATH = "/api/v1/auth";
const strict = { default: { limit: 10, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(strict)
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.login(dto, clientInfo(req));
  }

  @Public()
  @Throttle(strict)
  @Post("verify-otp")
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.respond(res, await this.auth.verifyOtp(dto, clientInfo(req)));
  }

  @Public()
  @Throttle(strict)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.respond(res, await this.auth.refresh(req.cookies?.[COOKIE], clientInfo(req)));
  }

  @Public()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  @Public()
  @Throttle(strict)
  @Post("set-password")
  setPassword(@Body() dto: SetPasswordDto, @Req() req: Request): Promise<void> {
    return this.auth.setPassword(dto.token, dto.password, clientInfo(req));
  }

  @Public()
  @Throttle(strict)
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    return this.auth.sessionUser(user.id);
  }

  private respond(res: Response, s: IssuedSession): AuthSession {
    res.cookie(COOKIE, s.refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
      path: COOKIE_PATH,
      maxAge: AUTH.refreshTokenDays * 86_400_000,
    });
    return { accessToken: s.accessToken, user: s.user };
  }
}
