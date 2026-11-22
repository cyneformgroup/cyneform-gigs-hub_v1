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
  {
    code: "sources.view",
    module: "sources",
    description: "View lead sources and harvest runs",
    superAdminOnly: false,
  },
  {
    code: "sources.manage",
    module: "sources",
    description: "Add, edit, test and run lead sources",
    superAdminOnly: false,
  },
  {
    code: "gigs.view",
    module: "gigs",
    description: "View published gigs",
    superAdminOnly: false,
  },
  {
    code: "gigs.review",
    module: "gigs",
    description: "Review, approve and reject discovered gigs",
    superAdminOnly: false,
  },
  {
    code: "gigs.claim",
    module: "gigs",
    description: "Claim gigs from the lead pool",
    superAdminOnly: false,
  },
  {
    code: "gigs.assign",
    module: "gigs",
    description: "Release or reassign claimed gigs",
    superAdminOnly: false,
  },
  {
    code: "rules.view",
    module: "rules",
    description: "View points rules and their history",
    superAdminOnly: false,
  },
  {
    code: "rules.manage",
    module: "rules",
    description: "Edit points rules, values and switches",
    superAdminOnly: false,
  },
  {
    code: "points.view_own",
    module: "points",
    description: "View own points",
    superAdminOnly: false,
  },
  {
    code: "points.view_all",
    module: "points",
    description: "View every BDP's points ledger",
    superAdminOnly: false,
  },
  {
    code: "points.manage",
    module: "points",
    description: "Verify points and make manual awards and adjustments",
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
    "sources.view",
    "sources.manage",
    "gigs.view",
    "gigs.review",
    "gigs.assign",
    "rules.view",
    "rules.manage",
    "points.view_own",
    "points.view_all",
    "points.manage",
  ],
  bdp: ["leave.request", "gigs.view", "gigs.claim", "points.view_own"],
};
