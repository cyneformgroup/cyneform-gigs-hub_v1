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
    code: "users.edit",
    module: "users",
    description: "Edit user profiles",
    superAdminOnly: false,
  },
  {
    code: "users.manage_status",
    module: "users",
    description: "Freeze, deactivate or reactivate users",
    superAdminOnly: false,
  },
  {
    code: "users.manage_admins",
    module: "users",
    description: "Create or change Admin accounts",
    superAdminOnly: true,
  },
  {
    code: "users.delete",
    module: "users",
    description: "Delete user accounts",
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
  {
    code: "leave.request",
    module: "leave",
    description: "Request leave",
    superAdminOnly: false,
  },
  {
    code: "leave.view_all",
    module: "leave",
    description: "See everyone’s leave requests",
    superAdminOnly: false,
  },
  {
    code: "leave.decide",
    module: "leave",
    description: "Approve or reject leave",
    superAdminOnly: false,
  },
  {
    code: "settings.view",
    module: "settings",
    description: "View system settings",
    superAdminOnly: false,
  },
  {
    code: "settings.manage",
    module: "settings",
    description: "Change system settings",
    superAdminOnly: false,
  },
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const ROLE_DEFAULTS: Record<RoleCode, readonly PermissionCode[]> = {
  super_admin: PERMISSIONS.map((p) => p.code),
  admin: [
    "users.view",
    "users.create",
    "users.edit",
    "users.manage_status",
    "permissions.view",
    "permissions.grant",
    "leave.request",
    "leave.view_all",
    "leave.decide",
    "settings.view",
    "settings.manage",
  ],
  bdp: ["leave.request"],
};
