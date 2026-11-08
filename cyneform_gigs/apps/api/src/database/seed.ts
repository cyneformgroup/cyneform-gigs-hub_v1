import "reflect-metadata";

import { createPool } from "mysql2/promise";

async function seed() {
  const pool = createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cyneform",
    timezone: "Z",
    connectionLimit: 10,
  });

  const connection = await pool.getConnection();

  try {
    // Seed roles
    await connection.execute(
      "INSERT IGNORE INTO roles (id, code, name) VALUES ('r1', 'super_admin', 'Super Admin')",
    );
    await connection.execute(
      "INSERT IGNORE INTO roles (id, code, name) VALUES ('r2', 'admin', 'Admin')",
    );
    await connection.execute(
      "INSERT IGNORE INTO roles (id, code, name) VALUES ('r3', 'bdp', 'BDP')",
    );

    // Seed permissions
    await connection.execute(
      "INSERT IGNORE INTO permissions (id, code, module, description, super_admin_only) VALUES ('p1', 'users.view', 'users', 'users.view', 0)",
    );
    await connection.execute(
      "INSERT IGNORE INTO permissions (id, code, module, description, super_admin_only) VALUES ('p2', 'users.create', 'users', 'users.create', 0)",
    );
    await connection.execute(
      "INSERT IGNORE INTO permissions (id, code, module, description, super_admin_only) VALUES ('p3', 'users.manage_admins', 'users', 'users.manage_admins', 1)",
    );
    await connection.execute(
      "INSERT IGNORE INTO permissions (id, code, module, description, super_admin_only) VALUES ('p4', 'permissions.view', 'users', 'permissions.view', 0)",
    );
    await connection.execute(
      "INSERT IGNORE INTO permissions (id, code, module, description, super_admin_only) VALUES ('p5', 'permissions.grant', 'users', 'permissions.grant', 0)",
    );

    // User creation skipped - requires proper schema setup
    // Super admin creation handled separately

    console.log("Roles and permissions seeded!");
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
