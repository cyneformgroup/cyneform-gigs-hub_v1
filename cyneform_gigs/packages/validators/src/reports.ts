import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid date");
const text = z.string().trim().min(3, "Please write at least a few words").max(2000);
export const SubmitReportSchema = z.object({
  weekStart: dateOnly,
  challenges: text,
  recommendations: text,
  feedback: text,
  setbacks: text,
  nextWeekCalls: text,
});
export const AdminReportQuerySchema = z.object({
  from: dateOnly,
  to: dateOnly,
  userIds: z
    .string()
    .max(20_000)
    .optional()
    .refine(
      (v) => !v || v.split(",").every((id) => z.uuid().safeParse(id).success),
      "Invalid BDP filter",
    ),
});
export const SubmissionQuerySchema = z.object({ weekStart: dateOnly.optional() });

export const WeekStatsSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  outreach: z.number(),
  deals: z.number(),
  revenue: z.number(),
  commission: z.number(),
  pipelineValue: z.number(),
  pointsEarned: z.number(),
  pointsByRule: z.array(z.object({ rule: z.string(), points: z.number() })),
  statusCounts: z.array(z.object({ status: z.string(), count: z.number() })),
  entries: z.array(
    z.object({ title: z.string(), status: z.string(), estimatedValue: z.number().nullable() }),
  ),
});
export const ReportItemSchema = z.object({
  id: z.string(),
  weekStart: z.string(),
  onTime: z.boolean(),
  submittedAt: z.string(),
  challenges: z.string(),
  recommendations: z.string(),
  feedback: z.string(),
  setbacks: z.string(),
  nextWeekCalls: z.string(),
});
export const CurrentReportSchema = z.object({
  weekStart: z.string(),
  deadline: z.string(),
  stats: WeekStatsSchema,
  report: ReportItemSchema.nullable(),
  canSubmitPrevious: z.boolean(),
});
export const AdminRowSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  outreach: z.number(),
  deals: z.number(),
  revenue: z.number(),
  commission: z.number(),
  points: z.number(),
  reports: z.number(),
});
export const AdminReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  rows: z.array(AdminRowSchema),
});
export const SubmissionItemSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  submitted: z.boolean(),
  onTime: z.boolean().nullable(),
});
export const DashboardSchema = z.object({
  tiles: z.object({
    activeBdps: z.number(),
    frozenBdps: z.number(),
    newLeadsToday: z.number(),
    outreachWeek: z.number(),
    dealsMonth: z.number(),
    revenueMonth: z.number(),
    commissionPending: z.number(),
    pointsWeek: z.number(),
  }),
  alerts: z.array(
    z.object({ level: z.enum(["info", "warn", "urgent"]), text: z.string(), link: z.string() }),
  ),
  top: z.array(z.object({ name: z.string().nullable(), revenue: z.number(), points: z.number() })),
  feed: z.array(
    z.object({
      at: z.string(),
      actor: z.string().nullable(),
      action: z.string(),
      target: z.string().nullable(),
    }),
  ),
  series: z.array(z.object({ day: z.string(), outreach: z.number(), revenue: z.number() })),
});

/** Monday of the EAT week containing `d`, as YYYY-MM-DD. */
export function eatWeekStart(d: Date): string {
  const eat = new Date(d.getTime() + 3 * 3_600_000);
  const dow = (eat.getUTCDay() + 6) % 7;
  eat.setUTCDate(eat.getUTCDate() - dow);
  return eat.toISOString().slice(0, 10);
}
/** UTC instants for an EAT date range; `toDateInclusive` includes the full day. */
export const eatRange = (fromDate: string, toDateInclusive: string) => ({
  start: new Date(`${fromDate}T00:00:00+03:00`),
  end: new Date(new Date(`${toDateInclusive}T00:00:00+03:00`).getTime() + 86_400_000),
});
export const weekEndDate = (weekStart: string) =>
  new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
/** Saturday 23:59:59.999 EAT of the report week. */
export const reportDeadline = (weekStart: string) =>
  new Date(new Date(`${weekStart}T00:00:00+03:00`).getTime() + 6 * 86_400_000 - 1);
