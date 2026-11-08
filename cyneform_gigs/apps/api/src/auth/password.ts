import { argon2id, hash, verify } from "argon2";

export const hashPassword = (plain: string): Promise<string> => hash(plain, { type: argon2id });
export const verifyPassword = (plain: string, digest: string): Promise<boolean> =>
  verify(digest, plain).catch(() => false);

let dummy: Promise<string> | undefined;
/** Burns the same time as a real check, so unknown emails can't be told apart by response time. */
export const fakeVerify = async (plain: string): Promise<void> => {
  dummy ??= hashPassword("not-a-real-password");
  await verifyPassword(plain, await dummy);
};
