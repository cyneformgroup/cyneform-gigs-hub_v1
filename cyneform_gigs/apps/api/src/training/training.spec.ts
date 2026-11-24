import {
  DEFAULT_WATERMARK,
  renderWatermark,
  TRAINING_MAX_BYTES,
  UploadTrainingSchema,
} from "@cyneform/validators";
import { describe, expect, it } from "vitest";

describe("training validators", () => {
  it("defaults safe folder and watermark metadata", () => {
    expect(UploadTrainingSchema.parse({ title: "Welcome" })).toMatchObject({
      folder: "General",
      watermark: DEFAULT_WATERMARK,
    });
  });
  it("rejects folder path traversal and oversize upload limits are 50 MiB", () => {
    expect(UploadTrainingSchema.safeParse({ title: "Welcome", folder: "../private" }).success).toBe(
      false,
    );
    expect(TRAINING_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
  it("renders all identity watermark placeholders", () => {
    expect(
      renderWatermark(DEFAULT_WATERMARK, {
        name: "Jane Doe",
        contractor: "CYN-2026-001",
        date: "24/11/2026",
      }),
    ).toBe("Jane Doe · CYN-2026-001 · 24/11/2026");
  });
});
