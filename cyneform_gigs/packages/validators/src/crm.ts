import { z } from "zod";

export const OUTREACH_CHANNELS = ["email", "phone", "social", "whatsapp", "sms"] as const;
export const CHANNEL_LABELS: Record<(typeof OUTREACH_CHANNELS)[number], string> = {
  email: "Email",
  phone: "Phone calls",
  social: "Social media DMs",
  whatsapp: "WhatsApp",
  sms: "SMS",
};
export const SOCIAL_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "facebook",
  "twitter",
] as const;

export const OutreachSchema = z
  .object({
    channels: z
      .array(z.enum(OUTREACH_CHANNELS))
      .min(1, "Please select at least one outreach channel"),
    socialPlatforms: z.array(z.enum(SOCIAL_PLATFORMS)).default([]),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => !v.channels.includes("social") || v.socialPlatforms.length > 0, {
    path: ["socialPlatforms"],
    message: "Pick at least one social platform",
  });

// Spec CRM-001 step 4: first keyword match wins, otherwise "Others". The BDP can override.
const TYPES: [string, string[]][] = [
  ["Wedding & Engagement", ["wedding", "bride", "groom", "engagement"]],
  ["Corporate Event", ["corporate", "business", "summit", "conference"]],
  ["Churches & Religious Org", ["church", "religious"]],
  ["NGO & Fundraising", ["fundraiser", "charity"]],
  ["Fashion Shows", ["fashion", "model"]],
  ["Musician & Artist", ["concert", "music"]],
  ["School/University", ["school", "university"]],
  ["Hotels & Venues", ["hotel", "venue"]],
  ["Product Launch", ["product launch"]],
  ["Sports Event", ["sports", "tournament"]],
  ["Political Rallies & Campaigns", ["political rally", "campaign rally"]],
  ["Cultural Festivals", ["cultural festival"]],
  ["Content Creators & Influencers", ["content creator", "influencer"]],
  ["Fitness Centers & Gyms", ["fitness", "gym"]],
  ["Beauty & Fashion Brands", ["beauty", "cosmetics"]],
  ["Online Course Creators", ["online course"]],
  ["Podcasts", ["podcast"]],
  ["Birthday Parties", ["birthday"]],
  ["Baby Showers & Gender Reveals", ["baby shower", "gender reveal"]],
  ["Graduation Parties", ["graduation"]],
  ["Funeral Homes & Memorial Services", ["funeral", "memorial"]],
];
export const CLIENT_TYPES = [...TYPES.map(([label]) => label), "Others"] as const;
export function detectClientType(text: string): (typeof CLIENT_TYPES)[number] {
  const t = text.toLowerCase();
  for (const [label, words] of TYPES)
    if (words.some((w) => t.includes(w))) return label as (typeof CLIENT_TYPES)[number];
  return "Others";
}

const phone = z.string().regex(/^\+254[17]\d{8}$/, "Invalid phone format");
export const CrmContactsSchema = z.object({
  emails: z.array(z.email("Invalid email format")).max(10).default([]),
  phones: z.array(phone).max(10).default([]),
  social: z.record(z.string().max(40), z.string().max(120)).default({}),
  website: z.url().max(300).nullable().default(null),
});
export type CrmContacts = z.infer<typeof CrmContactsSchema>;

const SOCIAL_HOSTS: [string, string][] = [
  ["instagram.com", "instagram"],
  ["linkedin.com", "linkedin"],
  ["facebook.com", "facebook"],
  ["tiktok.com", "tiktok"],
  ["twitter.com", "twitter"],
  ["x.com", "twitter"],
  ["youtube.com", "youtube"],
];

/** Spec CRM-001 step 3: emails, Kenyan phones, social handles and a website, from free text. */
export function extractContacts(text: string): CrmContacts {
  const emails = [
    ...new Set(text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) ?? []),
  ].map((e) => e.toLowerCase());
  const phones = [
    ...new Set(
      (text.match(/(?:\+254|\b0)[17]\d{8}\b/g) ?? []).map((p) =>
        p.startsWith("+254") ? p : `+254${p.slice(1)}`,
      ),
    ),
  ];
  const social: Record<string, string> = {};
  let website: string | null = null;
  for (const url of text.match(/https?:\/\/[^\s<>"')]+/g) ?? []) {
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const hit = SOCIAL_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`));
    if (hit) social[hit[1]] ??= url.slice(0, 120);
    else website ??= url.slice(0, 300);
  }
  const handle = text.match(/(?:^|\s)(@[A-Za-z0-9_.]{2,30})\b/);
  if (handle && !Object.keys(social).length) social.handle = handle[1] as string;
  return { emails: emails.slice(0, 10), phones: phones.slice(0, 10), social, website };
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Merge what the scraper stored on the lead with what we extract from its text. Tolerant of older shapes. */
export function mergeContacts(stored: unknown, extracted: CrmContacts): CrmContacts {
  const s = asRecord(stored);
  const legacy = extractContacts([...strings(s.handles), ...strings(s.websites)].join(" "));
  const social = { ...asRecord(s.social) } as Record<string, string>;
  for (const k of Object.keys(social)) if (typeof social[k] !== "string") delete social[k];
  const out = {
    emails: [
      ...new Set([...strings(s.emails).map((e) => e.toLowerCase()), ...extracted.emails]),
    ].slice(0, 10),
    phones: [...new Set([...strings(s.phones), ...extracted.phones])]
      .filter((p) => /^\+254[17]\d{8}$/.test(p))
      .slice(0, 10),
    social: { ...extracted.social, ...legacy.social, ...social },
    website:
      (typeof s.website === "string" ? s.website : null) ?? legacy.website ?? extracted.website,
  };
  const parsed = CrmContactsSchema.safeParse(out);
  return parsed.success ? parsed.data : { ...extracted };
}

export const CRM_STATUSES = [
  "1st_pitch_sent",
  "responded",
  "followup_1",
  "followup_2",
  "followup_3",
  "alignment_call_booked",
  "lost",
  "won",
] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];
export const PROGRESS = [
  "1st_pitch_sent",
  "responded",
  "followup_1",
  "followup_2",
  "followup_3",
] as const;
export const STATUS_LABELS: Record<CrmStatus, string> = {
  "1st_pitch_sent": "1st Pitch Sent",
  responded: "Responded",
  followup_1: "Follow-up 1 Stage",
  followup_2: "Follow-up 2 Stage",
  followup_3: "Follow-up 3 Stage",
  alignment_call_booked: "Alignment Call Booked",
  lost: "Lost/Rejected",
  won: "Won - Closed",
};

/** Spec CRM-003. Forward only, Won/Lost from any stage and final, Alignment Call Booked once, any time. */
export function allowedNext(statuses: readonly string[]): CrmStatus[] {
  if (statuses.includes("won") || statuses.includes("lost")) return [];
  const rank = Math.max(
    ...statuses.map((s) => PROGRESS.indexOf(s as (typeof PROGRESS)[number])),
    0,
  );
  const next: CrmStatus[] = PROGRESS.filter((_, i) => i > rank);
  if (!statuses.includes("alignment_call_booked")) next.push("alignment_call_booked");
  return [...next, "won", "lost"];
}

export type CompletionInput = {
  clientType: string | null;
  decisionMakerName: string | null;
  jobTitle: string | null;
  contacts: CrmContacts;
  channels: readonly string[];
  fileCount: number;
};
/** Spec CRM-004 and Appendix F: one specific message per missing field. Shared by the API and the form. */
export function missingFields(e: CompletionInput): Record<string, string> {
  const m: Record<string, string> = {};
  if (!e.clientType) m.clientType = "Please select a sector / client type";
  if (!e.decisionMakerName?.trim()) m.decisionMakerName = "Decision Maker Name is required";
  if (!e.jobTitle?.trim()) m.jobTitle = "Job Title is required";
  if (
    e.contacts.emails.length +
      e.contacts.phones.length +
      Object.keys(e.contacts.social).length +
      (e.contacts.website ? 1 : 0) ===
    0
  ) {
    m.contacts = "Please add at least one contact";
  }
  if (e.channels.length === 0) m.channels = "Please select at least one outreach channel";
  if (e.fileCount === 0) m.evidence = "Please upload evidence";
  return m;
}

export const UpdateEntrySchema = z.object({
  clientType: z.enum(CLIENT_TYPES).optional(),
  decisionMakerName: z.string().trim().max(255).optional(),
  jobTitle: z.string().trim().max(255).optional(),
  contacts: CrmContactsSchema.optional(),
  channels: z.array(z.enum(OUTREACH_CHANNELS)).optional(),
  socialPlatforms: z.array(z.enum(SOCIAL_PLATFORMS)).optional(),
  outreachNotes: z.string().trim().max(1000).optional(),
});
export const ChangeEntryStatusSchema = z.object({
  status: z.enum([
    "responded",
    "followup_1",
    "followup_2",
    "followup_3",
    "alignment_call_booked",
    "lost",
    "won",
  ]),
});
export const EntryQuerySchema = z.object({
  userId: z.uuid().optional(),
  status: z.enum(CRM_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const EntryItemSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  clientName: z.string(),
  clientType: z.string().nullable(),
  currentStatus: z.string(),
  isCompleted: z.boolean(),
  ownerName: z.string().nullable(),
  followup1Date: z.string().nullable(),
  followup2Date: z.string().nullable(),
  followup3Date: z.string().nullable(),
  createdAt: z.string(),
});
export const EntryPageSchema = z.object({
  items: z.array(EntryItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const EvidenceFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  createdAt: z.string(),
});
export const EntryDetailSchema = EntryItemSchema.extend({
  description: z.string().nullable(),
  decisionMakerName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  contacts: CrmContactsSchema,
  channels: z.array(z.string()),
  socialPlatforms: z.array(z.string()),
  outreachNotes: z.string().nullable(),
  statuses: z.array(z.string()),
  allowedNext: z.array(z.string()),
  missing: z.record(z.string(), z.string()),
  files: z.array(EvidenceFileSchema),
  pointsEarned: z.number(),
  completedAt: z.string().nullable(),
  callStatus: z.string().nullable(),
  callStartsAt: z.string().nullable(),
  wonAt: z.string().nullable(),
  lostAt: z.string().nullable(),
  flaggedGenericAt: z.string().nullable(),
  flagReason: z.string().nullable(),
  mine: z.boolean(),
});
export const OutreachResultSchema = z.object({ entryId: z.string() });
export const FlagEntrySchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});
