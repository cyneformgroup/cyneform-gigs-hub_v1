import type {
  AdminReportQuerySchema,
  AdminReportSchema,
  CurrentReportSchema,
  DashboardSchema,
  ReportItemSchema,
  SubmissionItemSchema,
  SubmitReportSchema,
  WeekStatsSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type SubmitReportInput = z.infer<typeof SubmitReportSchema>;
export type AdminReportQuery = z.infer<typeof AdminReportQuerySchema>;
export type WeekStats = z.infer<typeof WeekStatsSchema>;
export type ReportItem = z.infer<typeof ReportItemSchema>;
export type CurrentReport = z.infer<typeof CurrentReportSchema>;
export type AdminReport = z.infer<typeof AdminReportSchema>;
export type SubmissionItem = z.infer<typeof SubmissionItemSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
