export const DEACTIVATION_TYPES = ["temporary", "permanent"] as const;
export type DeactivationType = (typeof DEACTIVATION_TYPES)[number];

/** Preset freeze reasons (spec ACC-001). "Other" uses free text. */
export const FREEZE_REASONS = [
  "Under management review",
  "Official leave",
  "Inactive for more than 7 days",
] as const;
