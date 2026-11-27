import { z } from "zod";

export const POINT_SCHEMES = [
  {
    key: "workflow",
    label: "Workflow actions",
    note: "Points for everyday CRM actions (spec CRM-005).",
  },
  {
    key: "layered",
    label: "Layered matrix",
    note: "Points per outreach layer, with quality verification (spec COMP-001).",
  },
] as const;
export type PointScheme = (typeof POINT_SCHEMES)[number]["key"];
export const SCHEME_DEFAULTS: Record<PointScheme, boolean> = { workflow: true, layered: false };

export type PointRuleDef = {
  key: string;
  scheme: PointScheme;
  group: string;
  label: string;
  defaultPoints: number;
  verificationRequired: boolean;
  upgradeOf?: readonly string[];
};

const layered = (
  key: string,
  group: string,
  label: string,
  defaultPoints: number,
  upgradeOf?: readonly string[],
): PointRuleDef => ({
  key,
  scheme: "layered",
  group,
  label,
  defaultPoints,
  verificationRequired: true,
  upgradeOf,
});
const workflow = (key: string, label: string, defaultPoints: number): PointRuleDef => ({
  key,
  scheme: "workflow",
  group: "Workflow actions",
  label,
  defaultPoints,
  verificationRequired: false,
});

export const POINT_RULES: readonly PointRuleDef[] = [
  layered("hook_ghosted", "Layer 1: Initial Hook", "Outreach node (ghosted)", 0.5),
  layered("hook_response", "Layer 1: Initial Hook", "Outreach node (response)", 1, [
    "hook_ghosted",
  ]),
  layered("hook_call", "Layer 1: Initial Hook", "Outreach node (converts to call)", 2, [
    "hook_response",
    "hook_ghosted",
  ]),
  layered("call_booked", "Layer 2: Alignment Call", "Successful call booking", 2),
  layered("call_attended", "Layer 2: Alignment Call", "Alignment call attended (5+ min)", 3),
  layered("call_presentation", "Layer 2: Alignment Call", "Document presentation", 4),
  layered("handshake_followup_booked", "Layer 3: Admin Handshake", "Follow-up booked", 2),
  layered(
    "handshake_summary_released",
    "Layer 3: Admin Handshake",
    "Institutional summary released",
    3,
  ),
  layered(
    "handshake_strategic_followup",
    "Layer 3: Admin Handshake",
    "Strategic follow-up sequence",
    1,
  ),
  layered("field_recon_audit", "Layer 4: Field Recon", "Forensic venue ground audit", 5),
  layered("deal_lost_closure", "Layer 5: Deal Audit", "Final lost deal outcome (ghosted)", 5),
  workflow("claim", "Claiming a lead", 5),
  workflow("outreach_sent", "Marking outreach sent", 5),
  workflow("decision_maker", "Filling decision maker name", 3),
  workflow("job_title", "Filling job title", 3),
  workflow("evidence_uploaded", "Uploading evidence", 5),
  workflow("entry_completed", "CRM entry completed", 10),
  workflow("followup_1", "Follow-up 1 completed", 10),
  workflow("followup_2", "Follow-up 2 completed", 10),
  workflow("followup_3", "Follow-up 3 completed", 10),
  workflow("deal_won", "Deal won", 20),
  workflow("deal_lost", "Deal lost (effort recognition)", 5),
  workflow("meeting_attendance", "Meeting attendance marked", 5),
  workflow("training_completed", "Training completed", 3),
  workflow("weekly_report", "On-time weekly report", 10),
];

export const MANUAL_ADJUSTMENT = "manual_adjustment";
export const POINT_RULE_KEYS = POINT_RULES.map((rule) => rule.key) as [string, ...string[]];
export type PointRuleKey = (typeof POINT_RULES)[number]["key"];
export const RULE_BY_KEY = new Map(POINT_RULES.map((rule) => [rule.key, rule] as const));
export const RULE_LABELS: Record<string, string> = {
  ...Object.fromEntries(POINT_RULES.map((rule) => [rule.key, rule.label])),
  [MANUAL_ADJUSTMENT]: "Manual adjustment",
};

export const LEDGER_STATUSES = [
  "active",
  "pending_verification",
  "expired",
  "voided",
  "used",
] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];
export const MILESTONES = [500, 1000, 2500, 5000] as const;

const PointsValue = z
  .number()
  .min(0)
  .max(1000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "At most 2 decimal places");
const Reason = z.string().trim().min(3, "Give a short reason").max(500);
const RuleKey = z.string().refine((key) => RULE_BY_KEY.has(key), "Unknown rule");

export const RuleChangeSchema = z.object({
  points: PointsValue.optional(),
  enabled: z.boolean().optional(),
  verificationRequired: z.boolean().optional(),
});
export const UpdateRulesSchema = z.object({
  baseVersion: z.number().int().min(0),
  reason: Reason,
  rules: z.record(z.string(), RuleChangeSchema).default({}),
  schemes: z.record(z.string(), z.boolean()).default({}),
});
export const RestoreVersionSchema = z.object({
  baseVersion: z.number().int().min(0),
  reason: Reason,
});

export const PointRuleItemSchema = z.object({
  key: z.string(),
  scheme: z.enum(["workflow", "layered"]),
  group: z.string(),
  label: z.string(),
  points: z.number(),
  defaultPoints: z.number(),
  enabled: z.boolean(),
  verificationRequired: z.boolean(),
  upgradeOf: z.array(z.string()),
});
export const RulesViewSchema = z.object({
  version: z.number(),
  schemes: z.array(
    z.object({
      key: z.enum(["workflow", "layered"]),
      label: z.string(),
      note: z.string(),
      enabled: z.boolean(),
    }),
  ),
  rules: z.array(PointRuleItemSchema),
});
export const RuleVersionItemSchema = z.object({
  id: z.string(),
  versionNo: z.number(),
  reason: z.string(),
  changedByName: z.string().nullable(),
  createdAt: z.string(),
});

export const LedgerQuerySchema = z.object({
  userId: z.uuid().optional(),
  status: z.enum(LEDGER_STATUSES).optional(),
  ruleKey: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const LedgerEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string().nullable(),
  ruleKey: z.string(),
  ruleLabel: z.string(),
  points: z.number(),
  cashEquivalent: z.number(),
  status: z.enum(LEDGER_STATUSES),
  leadId: z.string().nullable(),
  leadTitle: z.string().nullable(),
  earnedAt: z.string(),
  expiresAt: z.string().nullable(),
  note: z.string().nullable(),
});
export const LedgerPageSchema = z.object({
  items: z.array(LedgerEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const MyPointsSchema = z.object({
  active: z.number(),
  pending: z.number(),
  expiringSoon: z.number(),
  kesPerPoint: z.number(),
  cashValue: z.number(),
  nextMilestone: z.number().nullable(),
  ledger: LedgerPageSchema,
});
export const AwardSchema = z.object({
  userId: z.uuid(),
  ruleKey: RuleKey,
  leadId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
});
export const AdjustSchema = z.object({
  userId: z.uuid(),
  points: z
    .number()
    .min(-1000)
    .max(1000)
    .refine((v) => v !== 0, "Cannot be zero")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "At most 2 decimal places"),
  reason: Reason,
});
export const VerifySchema = z.object({
  decision: z.enum(["verify", "reject"]),
  note: z.string().trim().max(500).optional(),
});
export const BdpOptionSchema = z.object({ id: z.string(), fullName: z.string() });
