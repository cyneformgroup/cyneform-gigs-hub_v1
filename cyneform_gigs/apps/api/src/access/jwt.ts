import type { RoleCode } from "@cyneform/types";
import { jwtVerify, SignJWT } from "jose";
import { AUTH, env } from "../config/env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
  role: RoleCode;
}

export const signAccessToken = (c: AccessClaims): Promise<string> =>
  new SignJWT({ sid: c.sid, role: c.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${AUTH.accessTokenSeconds}s`)
    .sign(secret);

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return {
    sub: payload.sub as string,
    sid: payload.sid as string,
    role: payload.role as RoleCode,
  };
}
