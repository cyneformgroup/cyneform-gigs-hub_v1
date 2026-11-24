import { CreateMeetingSchema, MarkAttendanceSchema } from "@cyneform/validators";
import { describe, expect, it } from "vitest";

const base = { title: "Weekly check-in", startsAt: "2026-11-25T07:00:00.000Z", durationMin: 30 };
describe("calendar validators", () => {
  it("requires attendees or all BDPs", () => {
    expect(CreateMeetingSchema.safeParse(base).success).toBe(false);
    expect(CreateMeetingSchema.safeParse({ ...base, allBdps: true }).success).toBe(true);
  });
  it("requires a bounded occurrence count for recurring meetings", () => {
    expect(
      CreateMeetingSchema.safeParse({ ...base, allBdps: true, recurrence: "weekly" }).success,
    ).toBe(false);
    expect(
      CreateMeetingSchema.safeParse({
        ...base,
        allBdps: true,
        recurrence: "weekly",
        occurrences: 27,
      }).success,
    ).toBe(false);
    expect(
      CreateMeetingSchema.safeParse({
        ...base,
        allBdps: true,
        recurrence: "weekly",
        occurrences: 4,
      }).success,
    ).toBe(true);
  });
  it("validates attendance payload identifiers and boolean state", () => {
    expect(MarkAttendanceSchema.safeParse({ userId: "not-a-uuid", attended: true }).success).toBe(
      false,
    );
  });
});
