import {
  and,
  authSessions,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  loginAttempts,
  newId,
  oneTimeLinks,
  otpChallenges,
  passwordHistory,
  roles,
  type User,
  userProfiles,
  users,
} from "@cyneform/db";
import type { LoginInput, LoginResponse, SessionUser, VerifyOtpInput } from "@cyneform/types";
import { Inject, Injectable } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import { signAccessToken } from "../access/jwt";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { blindIndex, otpHash, randomToken, safeEqual, sha256, storedEmail } from "../common/crypto";
import { AppError, unauthorized } from "../common/errors";
import { AUTH, env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { MailService } from "../mail/mail.service";
import { fakeVerify, hashPassword, verifyPassword } from "./password";

const minutes = (n: number) => n * 60_000;
const invalidCredentials = () =>
  unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");
const invalidOtp = () => unauthorized("INVALID_OTP", "That code is not valid or has expired.");

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const statusRefusal = (status: User["status"]) => {
  switch (status) {
    case "frozen":
      return {
        code: "ACCOUNT_FROZEN",
        message: `Your account is under management review. Contact WhatsApp ${env.SUPPORT_WHATSAPP}.`,
      };
    case "on_leave":
      return {
        code: "ACCOUNT_ON_LEAVE",
        message: "Your account is temporarily frozen as you are on official leave.",
      };
    case "deactivated":
      return {
        code: "ACCOUNT_DEACTIVATED",
        message: "Your account has been deactivated. Please contact management.",
      };
    default:
      return {
        code: "ACCOUNT_INACTIVE",
        message: "This account is not active. Contact your administrator.",
      };
  }
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccessService)
    private readonly access: AccessService,
    @Inject(AuditService)
    private readonly audit: AuditService,
    @Inject(MailService)
    private readonly mail: MailService,
  ) {}

  // ---- Step 1: password ----------------------------------------------------------------
  async login(input: LoginInput, client: ClientInfo): Promise<LoginResponse> {
    const emailBidx = blindIndex(input.email);
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.businessEmailBidx, emailBidx), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      await fakeVerify(input.password);
      await this.attempt(null, emailBidx, "not_found", client);
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.attempt(user.id, emailBidx, "locked", client);
      throw new AppError(
        "ACCOUNT_LOCKED",
        "Too many failed attempts. Try again in 30 minutes.",
        423,
      );
    }
    const ok = user.passwordHash ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!ok) {
      await this.attempt(user.id, emailBidx, "bad_password", client);
      await this.applyLockout(user.id);
      throw invalidCredentials();
    }
    if (user.status !== "active") {
      await this.attempt(user.id, emailBidx, user.status, client);
      const { code, message } = statusRefusal(user.status);
      throw new AppError(code, message, 403);
    }
    return { challengeId: await this.issueOtp(user, client) };
  }

  // ---- Step 2: one-time code -----------------------------------------------------------
  async verifyOtp(input: VerifyOtpInput, client: ClientInfo): Promise<IssuedSession> {
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.id, input.challengeId))
      .limit(1);
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= AUTH.otpMaxAttempts
    ) {
      throw invalidOtp();
    }
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, challenge.userId))
      .limit(1);
    if (user?.status !== "active" || user.deletedAt) throw invalidOtp();

    const bidx = user.businessEmailBidx;
    if (!safeEqual(otpHash(challenge.id, input.code), challenge.otpHash)) {
      await this.db
        .update(otpChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(otpChallenges.id, challenge.id));
      await this.attempt(user.id, bidx, "bad_otp", client);
      await this.applyLockout(user.id);
      throw invalidOtp();
    }
    await this.db
      .update(otpChallenges)
      .set({ usedAt: new Date() })
      .where(eq(otpChallenges.id, challenge.id));
    await this.attempt(user.id, bidx, "success", client);
    return this.createSession(user, client);
  }

  // ---- Sessions ------------------------------------------------------------------------
  private async createSession(user: User, client: ClientInfo): Promise<IssuedSession> {
    const now = new Date();
    const active = await this.db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, user.id),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      )
      .orderBy(authSessions.createdAt);
    const surplus = active.slice(0, Math.max(0, active.length - (AUTH.maxSessions - 1)));
    if (surplus.length) {
      await this.db
        .update(authSessions)
        .set({ revokedAt: now, revokeReason: "limit" })
        .where(
          inArray(
            authSessions.id,
            surplus.map((s: { id: string }) => s.id),
          ),
        );
    }

    const sessionId = newId();
    const refreshToken = randomToken();
    await this.db.insert(authSessions).values({
      id: sessionId,
      userId: user.id,
      familyId: newId(),
      refreshTokenHash: sha256(refreshToken),
      ipAddress: client.ip,
      userAgent: client.userAgent,
      lastActiveAt: now,
      expiresAt: new Date(now.getTime() + AUTH.refreshTokenDays * 86_400_000),
    });
    await this.db
      .update(users)
      .set({
        lastLoginAt: now,
        lastLoginIp: client.ip,
        loginCount: user.loginCount + 1,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, user.id));

    const sessionUser = await this.sessionUser(user.id);
    await this.audit.record({
      actor: { id: user.id, role: sessionUser.role },
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      client,
    });
    return {
      accessToken: await signAccessToken({
        sub: user.id,
        sid: sessionId,
        role: sessionUser.role,
      }),
      refreshToken,
      user: sessionUser,
    };
  }

  /** Swaps the refresh token for a new one. Presenting an already-used token ends the whole session family. */
  async refresh(token: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    if (!token) throw unauthorized();
    const hash = sha256(token);
    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.refreshTokenHash, hash))
      .limit(1);

    if (!session) {
      const [reused] = await this.db
        .select()
        .from(authSessions)
        .where(eq(authSessions.previousTokenHash, hash))
        .limit(1);
      if (reused) {
        await this.db
          .update(authSessions)
          .set({ revokedAt: new Date(), revokeReason: "reuse_detected" })
          .where(and(eq(authSessions.familyId, reused.familyId), isNull(authSessions.revokedAt)));
        await this.audit.record({
          actor: null,
          action: "auth.refresh_reuse_detected",
          targetType: "user",
          targetId: reused.userId,
          client,
        });
      }
      throw unauthorized();
    }
    const now = new Date();
    const idle = session.lastActiveAt.getTime() < now.getTime() - minutes(AUTH.idleMinutes);
    if (session.revokedAt || session.expiresAt <= now || idle) {
      if (idle && !session.revokedAt) {
        await this.db
          .update(authSessions)
          .set({ revokedAt: now, revokeReason: "idle" })
          .where(eq(authSessions.id, session.id));
      }
      throw unauthorized("SESSION_ENDED", "Your session has ended.");
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (user?.status !== "active" || user.deletedAt)
      throw unauthorized("SESSION_ENDED", "Your session has ended.");

    const refreshToken = randomToken();
    await this.db
      .update(authSessions)
      .set({
        refreshTokenHash: sha256(refreshToken),
        previousTokenHash: hash,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + AUTH.refreshTokenDays * 86_400_000),
        ipAddress: client.ip,
        userAgent: client.userAgent,
      })
      .where(eq(authSessions.id, session.id));
    const sessionUser = await this.sessionUser(user.id);
    return {
      accessToken: await signAccessToken({
        sub: user.id,
        sid: session.id,
        role: sessionUser.role,
      }),
      refreshToken,
      user: sessionUser,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date(), revokeReason: "logout" })
      .where(and(eq(authSessions.refreshTokenHash, sha256(token)), isNull(authSessions.revokedAt)));
  }

  async sessionUser(userId: string): Promise<SessionUser> {
    const [row] = await this.db
      .select({
        id: users.id,
        roleId: users.roleId,
        role: roles.code,
        fullName: userProfiles.fullName,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw unauthorized();
    const granted = await this.access.effectivePermissions(row.id, row.roleId, row.role);
    return {
      id: row.id,
      fullName: row.fullName,
      role: row.role,
      permissions: [...granted].sort(),
    };
  }

  // ---- Passwords -----------------------------------------------------------------------
  /** Single-use link: set-password for new people, reset-password for forgotten ones. */
  async issueLink(
    userId: string,
    purpose: "set_password" | "reset_password",
  ): Promise<{ url: string; expiresAt: Date }> {
    const token = randomToken();
    const hours = purpose === "set_password" ? AUTH.setPasswordHours : AUTH.resetPasswordHours;
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    await this.db
      .update(oneTimeLinks)
      .set({ usedAt: new Date() })
      .where(and(eq(oneTimeLinks.userId, userId), isNull(oneTimeLinks.usedAt)));
    await this.db
      .insert(oneTimeLinks)
      .values({ userId, purpose, tokenHash: sha256(token), expiresAt });
    return { url: `${env.APP_URL}/set-password?token=${token}`, expiresAt };
  }

  async setPassword(token: string, password: string, client: ClientInfo): Promise<void> {
    const [link] = await this.db
      .select()
      .from(oneTimeLinks)
      .where(eq(oneTimeLinks.tokenHash, sha256(token)))
      .limit(1);
    if (!link || link.usedAt || link.expiresAt <= new Date()) {
      throw new AppError(
        "LINK_INVALID",
        "This link is invalid or has expired. Ask for a new one.",
        400,
      );
    }
    const recent = await this.db
      .select({ hash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, link.userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(AUTH.passwordHistory);
    for (const { hash } of recent) {
      if (await verifyPassword(password, hash)) {
        throw new AppError(
          "PASSWORD_REUSED",
          `Choose a password you have not used in your last ${AUTH.passwordHistory}.`,
          400,
        );
      }
    }

    const hash = await hashPassword(password);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: hash,
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, link.userId));
      await tx.insert(passwordHistory).values({ userId: link.userId, passwordHash: hash });
      await tx.update(oneTimeLinks).set({ usedAt: now }).where(eq(oneTimeLinks.id, link.id));
      await tx
        .update(authSessions)
        .set({ revokedAt: now, revokeReason: "password_change" })
        .where(and(eq(authSessions.userId, link.userId), isNull(authSessions.revokedAt)));
    });
    await this.audit.record({
      actor: { id: link.userId, role: "self" },
      action: "auth.password_set",
      targetType: "user",
      targetId: link.userId,
      details: { purpose: link.purpose },
      client,
    });
  }

  /** Always looks successful to the caller, so it can't be used to discover accounts. */
  async forgotPassword(email: string): Promise<void> {
    const [row] = await this.db
      .select({
        id: users.id,
        status: users.status,
        personalEmail: userProfiles.personalEmail,
        personalEmailCt: userProfiles.personalEmailCt,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.businessEmailBidx, blindIndex(email)), isNull(users.deletedAt)))
      .limit(1);
    if (row?.status !== "active") return;
    const { url } = await this.issueLink(row.id, "reset_password");
    await this.mail.send(
      storedEmail(row.personalEmail, row.personalEmailCt),
      "Reset your CyneForm password",
      `Use this link within ${AUTH.resetPasswordHours} hour to choose a new password:\n${url}`,
    );
  }

  // ---- Helpers -------------------------------------------------------------------------
  private async issueOtp(user: User, client: ClientInfo): Promise<string> {
    await this.db
      .update(otpChallenges)
      .set({ usedAt: new Date() })
      .where(and(eq(otpChallenges.userId, user.id), isNull(otpChallenges.usedAt)));

    const id = newId();
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await this.db.insert(otpChallenges).values({
      id,
      userId: user.id,
      otpHash: otpHash(id, code),
      expiresAt: new Date(Date.now() + minutes(AUTH.otpMinutes)),
      ipAddress: client.ip,
    });
    await this.mail.sendTemplate(storedEmail(user.businessEmail, user.businessEmailCt), "otp", {
      code,
      minutes: AUTH.otpMinutes,
    });
    return id;
  }

  private attempt(userId: string | null, emailBidx: Buffer, outcome: string, client: ClientInfo) {
    return this.db.insert(loginAttempts).values({
      userId,
      emailBidx,
      outcome,
      ipAddress: client.ip,
      userAgent: client.userAgent,
    });
  }

  /** 5 failures within 15 minutes lock the account for 30 minutes. */
  private async applyLockout(userId: string): Promise<void> {
    const since = new Date(Date.now() - minutes(AUTH.failureWindowMinutes));
    const [{ failures = 0 } = {}] = await this.db
      .select({ failures: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.userId, userId),
          inArray(loginAttempts.outcome, ["bad_password", "bad_otp"]),
          gt(loginAttempts.createdAt, since),
        ),
      );
    const locked = failures >= AUTH.lockAfterFailures;
    await this.db
      .update(users)
      .set({
        failedLoginCount: failures,
        ...(locked ? { lockedUntil: new Date(Date.now() + minutes(AUTH.lockMinutes)) } : {}),
      })
      .where(eq(users.id, userId));
    if (locked)
      await this.audit.record({
        actor: null,
        action: "auth.account_locked",
        targetType: "user",
        targetId: userId,
      });
  }
}
