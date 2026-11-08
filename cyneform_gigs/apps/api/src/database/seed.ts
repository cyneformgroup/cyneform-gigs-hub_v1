import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PERMISSIONS, ROLE_CODES, ROLE_DEFAULTS } from "@cyneform/validators";
import { createPool } from "mysql2/promise";
import {
  blindIndex,
  currentKeyId,
  encrypt,
  randomToken,
  sha256,
} from "../common/crypto";
import { env } from "../config/env";

const roleNames = {
  super_admin: "Super Admin",
  admin: "Admin",
  bdp: "BDP",
} as const;

function requiredId(ids: Map<string, string>, code: string): string {
  const id = ids.get(code);
  if (!id) throw new Error(`Seed failed to resolve database id for ${code}.`);
  return id;
}

async function seed() {
  const pool = createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cyneform",
    timezone: "Z",
    connectionLimit: 2,
  });

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const roleIds = new Map<string, string>();
      for (const code of ROLE_CODES) {
        const id = randomUUID();
        await connection.execute(
          "INSERT INTO roles (id, code, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
          [id, code, roleNames[code]],
        );
        const [rows] = await connection.execute(
          "SELECT id FROM roles WHERE code = ? LIMIT 1",
          [code],
        );
        roleIds.set(code, (rows as { id: string }[])[0].id);
      }

      const permissionIds = new Map<string, string>();
      for (const permission of PERMISSIONS) {
        const id = randomUUID();
        await connection.execute(
          "INSERT INTO permissions (id, code, module, description, super_admin_only) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description), super_admin_only = VALUES(super_admin_only)",
          [
            id,
            permission.code,
            permission.module,
            permission.description,
            permission.superAdminOnly,
          ],
        );
        const [rows] = await connection.execute(
          "SELECT id FROM permissions WHERE code = ? LIMIT 1",
          [permission.code],
        );
        permissionIds.set(permission.code, (rows as { id: string }[])[0].id);
      }

      // Role grants are a projection of the shared catalogue, so re-sync them on every seed.
      await connection.execute("DELETE FROM role_permissions");
      for (const role of ROLE_CODES) {
        for (const code of ROLE_DEFAULTS[role]) {
          await connection.execute(
            "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
            [requiredId(roleIds, role), requiredId(permissionIds, code)],
          );
        }
      }

      const businessEmail = env.SEED_ADMIN_BUSINESS_EMAIL;
      if (!businessEmail) {
        throw new Error(
          "Set SEED_ADMIN_BUSINESS_EMAIL in the root .env before seeding.",
        );
      }
      const personalEmail = env.SEED_ADMIN_PERSONAL_EMAIL || businessEmail;
      const businessBidx = blindIndex(businessEmail);
      const [existingRows] = await connection.execute(
        "SELECT id FROM users WHERE business_email_bidx = ? LIMIT 1",
        [businessBidx],
      );
      const existing = (existingRows as { id: string }[])[0];
      let adminId: string;
      let passwordToken: string | undefined;

      if (existing) {
        adminId = existing.id;
      } else {
        adminId = randomUUID();
        const year = new Date().getFullYear();
        const [numberRows] = await connection.execute(
          "SELECT contractor_number FROM user_profiles WHERE contractor_number LIKE ? ORDER BY contractor_number DESC LIMIT 1",
          [`CYN-${year}-%`],
        );
        const lastNumber = (numberRows as { contractor_number: string }[])[0]
          ?.contractor_number;
        const next = lastNumber ? Number(lastNumber.split("-")[2]) + 1 : 1;
        const contractorNumber = `CYN-${year}-${String(next).padStart(3, "0")}`;

        await connection.execute(
          "INSERT INTO users (id, role_id, business_email_ct, business_email_bidx) VALUES (?, ?, ?, ?)",
          [
            adminId,
            requiredId(roleIds, "super_admin"),
            encrypt(businessEmail),
            businessBidx,
          ],
        );
        await connection.execute(
          "INSERT INTO user_profiles (user_id, contractor_number, full_name, business_email_ct, personal_email_ct, personal_email_bidx, enc_key_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            adminId,
            contractorNumber,
            env.SEED_ADMIN_NAME,
            encrypt(businessEmail),
            encrypt(personalEmail),
            blindIndex(personalEmail),
            currentKeyId,
          ],
        );

        passwordToken = randomToken();
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await connection.execute(
          "INSERT INTO one_time_links (id, user_id, purpose, token_hash, expires_at) VALUES (?, ?, 'set_password', ?, ?)",
          [randomUUID(), adminId, sha256(passwordToken), expiresAt],
        );
      }

      await connection.commit();
      console.log("Roles and permissions synced.");
      if (passwordToken) {
        console.log(
          `Super Admin created for ${businessEmail}. Set the initial password using this token (expires in 72 hours):`,
        );
        console.log(passwordToken);
      } else {
        console.log(
          `Super Admin ${businessEmail} already exists; no new password token was issued.`,
        );
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}

void seed().catch((error: unknown) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
