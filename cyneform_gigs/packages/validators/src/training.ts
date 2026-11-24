import { z } from "zod";

export const TRAINING_TYPES = ["pdf", "docx", "pptx", "mp4", "jpg", "png"] as const;
export const TRAINING_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_WATERMARK = "{name} · {contractor} · {date}";

export const UploadTrainingSchema = z.object({
  title: z.string().trim().min(3, "Enter a title").max(150),
  description: z.string().trim().max(1000).optional(),
  folder: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9 _-]+$/, "Letters, numbers, spaces, dash and underscore only")
    .default("General"),
  watermark: z.string().trim().min(3).max(200).default(DEFAULT_WATERMARK),
});

export const TrainingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  folder: z.string(),
  fileType: z.enum(TRAINING_TYPES),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
  viewed: z.boolean(),
});
export const ViewSessionSchema = z.object({
  title: z.string(),
  fileType: z.enum(TRAINING_TYPES),
  url: z.string(),
  watermark: z.string(),
  expiresAt: z.string(),
  downloadable: z.boolean(),
});
export function renderWatermark(
  tpl: string,
  v: { name: string; contractor: string; date: string },
) {
  return tpl
    .replaceAll("{name}", v.name)
    .replaceAll("{contractor}", v.contractor)
    .replaceAll("{date}", v.date);
}
