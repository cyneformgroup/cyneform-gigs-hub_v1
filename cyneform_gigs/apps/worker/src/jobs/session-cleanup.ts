import { authSessions, db, loginAttempts, lt, oneTimeLinks, otpChallenges } from "@cyneform/db";

const DAY = 86_400_000;

export async function sessionCleanup() {
  const grace = new Date(Date.now() - 7 * DAY);
  const [sessions] = await db.delete(authSessions).where(lt(authSessions.expiresAt, grace));
  const [otps] = await db.delete(otpChallenges).where(lt(otpChallenges.expiresAt, grace));
  const [links] = await db.delete(oneTimeLinks).where(lt(oneTimeLinks.expiresAt, grace));
  const [attempts] = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(Date.now() - 30 * DAY)));
  console.log(
    `[session-cleanup] sessions=${sessions.affectedRows} otp=${otps.affectedRows} links=${links.affectedRows} attempts=${attempts.affectedRows}`,
  );
}
