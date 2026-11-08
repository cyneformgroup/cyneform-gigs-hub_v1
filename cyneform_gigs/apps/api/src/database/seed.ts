import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PERMISSIONS, ROLE_CODES, ROLE_DEFAULTS } from "@cyneform/validators";
import { createPool, type PoolConnection } from "mysql2/promise";
import { blindIndex, currentKeyId, decrypt, randomToken, sha256 } from "../common/crypto";
import { env } from "../config/env";

const roleNames = {
  super_admin: "Super Admin",
  admin: "Admin",
  bdp: "BDP",
} as const;

type SeedAccount = {
  name: string;
  role: (typeof ROLE_CODES)[number];
  businessEmail: string;
  personalEmail: string;
};

function requiredId(ids: Map<string, string>, code: string): string {
  const id = ids.get(code);
  if (!id) throw new Error(`Seed failed to resolve database id for ${code}.`);
  return id;
}

async function backfillPlaintextEmails(connection: PoolConnection): Promise<void> {
  const [userRows] = await connection.execute(
    "SELECT id, business_email, business_email_ct FROM users WHERE business_email IS NULL OR business_email_ct IS NOT NULL",
  );
  for (const row of userRows as {
    id: string;
    business_email: string | null;
    business_email_ct: Buffer | null;
  }[]) {
    const email =
      row.business_email ?? (row.business_email_ct ? decrypt(row.business_email_ct) : null);
    await connection.execute(
      "UPDATE users SET business_email = ?, business_email_ct = NULL WHERE id = ?",
      [email, row.id],
    );
  }

  const [profileRows] = await connection.execute(
    "SELECT user_id, personal_email, personal_email_ct FROM user_profiles WHERE personal_email IS NULL OR personal_email_ct IS NOT NULL OR business_email_ct IS NOT NULL",
  );
  for (const row of profileRows as {
    user_id: string;
    personal_email: string | null;
    personal_email_ct: Buffer | null;
  }[]) {
    const email =
      row.personal_email ?? (row.personal_email_ct ? decrypt(row.personal_email_ct) : null);
    await connection.execute(
      "UPDATE user_profiles SET personal_email = ?, business_email_ct = NULL, personal_email_ct = NULL WHERE user_id = ?",
      [email, row.user_id],
    );
  }
}

async function nextContractorNumber(connection: PoolConnection): Promise<string> {
  const year = new Date().getFullYear();
  const [rows] = await connection.execute(
    "SELECT contractor_number FROM user_profiles WHERE contractor_number LIKE ? ORDER BY contractor_number DESC LIMIT 1 FOR UPDATE",
    [`CYN-${year}-%`],
  );
  const last = (rows as { contractor_number: string }[])[0]?.contractor_number;
  const next = last ? Number(last.split("-")[2]) + 1 : 1;
  return `CYN-${year}-${String(next).padStart(3, "0")}`;
}

async function seedAccount(
  connection: PoolConnection,
  roleId: string,
  account: SeedAccount,
): Promise<string> {
  const businessEmail = account.businessEmail.trim().toLowerCase();
  const personalEmail = account.personalEmail.trim().toLowerCase();
  const businessBidx = blindIndex(businessEmail);
  const personalBidx = blindIndex(personalEmail);
  const [rows] = await connection.execute(
    "SELECT id FROM users WHERE business_email_bidx = ? LIMIT 1",
    [businessBidx],
  );
  let userId = (rows as { id: string }[])[0]?.id;

  if (userId) {
    await connection.execute(
      "UPDATE users SET role_id = ?, business_email = ?, business_email_ct = NULL WHERE id = ?",
      [roleId, businessEmail, userId],
    );
    await connection.execute(
      "UPDATE user_profiles SET full_name = ?, personal_email = ?, personal_email_bidx = ?, business_email_ct = NULL, personal_email_ct = NULL WHERE user_id = ?",
      [account.name, personalEmail, personalBidx, userId],
    );
    const [profileRows] = await connection.execute(
      "SELECT user_id FROM user_profiles WHERE user_id = ? LIMIT 1",
      [userId],
    );
    if (!(profileRows as { user_id: string }[])[0]) {
      await connection.execute(
        "INSERT INTO user_profiles (user_id, contractor_number, full_name, personal_email, personal_email_bidx, enc_key_id) VALUES (?, ?, ?, ?, ?, ?)",
        [
          userId,
          await nextContractorNumber(connection),
          account.name,
          personalEmail,
          personalBidx,
          currentKeyId,
        ],
      );
    }
  } else {
    userId = randomUUID();
    await connection.execute(
      "INSERT INTO users (id, role_id, business_email, business_email_bidx) VALUES (?, ?, ?, ?)",
      [userId, roleId, businessEmail, businessBidx],
    );
    await connection.execute(
      "INSERT INTO user_profiles (user_id, contractor_number, full_name, personal_email, personal_email_bidx, enc_key_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId,
        await nextContractorNumber(connection),
        account.name,
        personalEmail,
        personalBidx,
        currentKeyId,
      ],
    );
  }

  await connection.execute(
    "UPDATE one_time_links SET used_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND purpose = 'set_password' AND used_at IS NULL",
    [userId],
  );
  const token = randomToken();
  await connection.execute(
    "INSERT INTO one_time_links (id, user_id, purpose, token_hash, expires_at) VALUES (?, ?, 'set_password', ?, ?)",
    [randomUUID(), userId, sha256(token), new Date(Date.now() + 72 * 60 * 60 * 1000)],
  );
  return `${env.APP_URL}/set-password?token=${token}`;
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
      await backfillPlaintextEmails(connection);

      const roleIds = new Map<string, string>();
      for (const code of ROLE_CODES) {
        await connection.execute(
          "INSERT INTO roles (id, code, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
          [randomUUID(), code, roleNames[code]],
        );
        const [rows] = await connection.execute("SELECT id FROM roles WHERE code = ? LIMIT 1", [
          code,
        ]);
        roleIds.set(code, (rows as { id: string }[])[0].id);
      }

      const permissionIds = new Map<string, string>();
      for (const permission of PERMISSIONS) {
        await connection.execute(
          "INSERT INTO permissions (id, code, module, description, super_admin_only) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description), super_admin_only = VALUES(super_admin_only)",
          [
            randomUUID(),
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

      await connection.execute("DELETE FROM role_permissions");
      for (const role of ROLE_CODES) {
        for (const code of ROLE_DEFAULTS[role]) {
          await connection.execute(
            "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
            [requiredId(roleIds, role), requiredId(permissionIds, code)],
          );
        }
      }

      const accounts: SeedAccount[] = [
        {
          name: env.SEED_ADMIN_NAME,
          role: "super_admin",
          businessEmail: env.SEED_ADMIN_BUSINESS_EMAIL,
          personalEmail: env.SEED_ADMIN_PERSONAL_EMAIL,
        },
        {
          name: env.SEED_STAFF_ADMIN_NAME,
          role: "admin",
          businessEmail: env.SEED_STAFF_ADMIN_BUSINESS_EMAIL,
          personalEmail: env.SEED_STAFF_ADMIN_PERSONAL_EMAIL,
        },
        {
          name: env.SEED_BDP_NAME,
          role: "bdp",
          businessEmail: env.SEED_BDP_BUSINESS_EMAIL,
          personalEmail: env.SEED_BDP_PERSONAL_EMAIL,
        },
      ];
      const links: { account: SeedAccount; url: string }[] = [];
      for (const account of accounts) {
        const roleId = requiredId(roleIds, account.role);
        links.push({ account, url: await seedAccount(connection, roleId, account) });
      }

      await connection.commit();
      console.log("Plaintext user emails backfilled; roles and permissions synced.");
      for (const { account, url } of links) {
        console.log(`${account.role}: ${account.businessEmail} (one-time password setup): ${url}`);
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
