export const ROLE_CODES = ["super_admin", "admin", "bdp"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const USER_STATUSES = ["active", "frozen", "on_leave", "deactivated", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Permission catalogue. Later phases append here; `bun run db:seed` syncs it to the database. */
export const PERMISSIONS = [
  {
    code: "users.view",
    module: "users",
    description: "View users",
    superAdminOnly: false,
  },
  {
    code: "users.create",
    module: "users",
    description: "Onboard BDP accounts",
    superAdminOnly: false,
  },
  {
    code: "users.manage_admins",
    module: "users",
    description: "Create or change Admin accounts",
    superAdminOnly: true,
  },
  {
    code: "permissions.view",
    module: "permissions",
    description: "View roles and permissions",
    superAdminOnly: false,
  },
  {
    code: "permissions.grant",
    module: "permissions",
    description: "Grant or deny permissions per user",
    superAdminOnly: false,
  },
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const ROLE_DEFAULTS: Record<RoleCode, readonly PermissionCode[]> = {
  super_admin: PERMISSIONS.map((p) => p.code),
  admin: ["users.view", "users.create", "permissions.view", "permissions.grant"],
  bdp: [],
};
