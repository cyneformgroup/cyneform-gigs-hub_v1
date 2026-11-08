import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../config/env";

const keys = new Map(
  env.ENCRYPTION_KEYS.split(",").map((pair) => {
    const [id, b64] = pair.trim().split(":");
    const key = Buffer.from(b64 ?? "", "base64");
    if (!id || key.length !== 32)
      throw new Error('ENCRYPTION_KEYS must look like "1:<base64 of 32 bytes>"');
    return [Number(id), key] as const;
  }),
);
export const currentKeyId = Math.max(...keys.keys());

/** AES-256-GCM. Layout: keyId(1) | iv(12) | tag(16) | ciphertext. */
export function encrypt(plain: string): Buffer {
  const iv = randomBytes(12);
  const keyId = currentKeyId;
  const cipherKey = keys.get(keyId);
  if (!cipherKey) throw new Error("No encryption key found");
  const cipher = createCipheriv("aes-256-gcm", cipherKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([currentKeyId]), iv, cipher.getAuthTag(), ct]);
}

export function decrypt(blob: Buffer): string {
  const key = keys.get(blob[0]);
  if (!key) throw new Error(`Unknown encryption key id ${blob[0]}`);
  const decipher = createDecipheriv("aes-256-gcm", key, blob.subarray(1, 13));
  decipher.setAuthTag(blob.subarray(13, 29));
  return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]).toString("utf8");
}

/** Reads a plaintext email, with fallback for rows awaiting the legacy-email migration. */
export function storedEmail(plain: string | null, legacyCiphertext: Buffer | null): string {
  if (plain) return plain;
  if (legacyCiphertext) return decrypt(legacyCiphertext);
  throw new Error("A user email is missing from the database.");
}

/** Keyed hash so encrypted values can still be looked up and kept unique. */
export const blindIndex = (value: string): Buffer =>
  createHmac("sha256", env.BLIND_INDEX_KEY).update(value.trim().toLowerCase()).digest();

export const sha256 = (value: string | Buffer): Buffer =>
  createHash("sha256").update(value).digest();
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
export const otpHash = (challengeId: string, code: string): Buffer =>
  createHmac("sha256", env.BLIND_INDEX_KEY).update(`${challengeId}:${code}`).digest();
export const safeEqual = (a: Buffer, b: Buffer): boolean =>
  a.length === b.length && timingSafeEqual(a, b);
