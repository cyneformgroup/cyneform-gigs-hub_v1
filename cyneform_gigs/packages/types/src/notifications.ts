import type { NotificationPageSchema, NotificationSchema } from "@cyneform/validators";
import type { z } from "zod";

export type { NotificationType } from "@cyneform/validators";
export type NotificationItem = z.infer<typeof NotificationSchema>;
export type NotificationPage = z.infer<typeof NotificationPageSchema>;
