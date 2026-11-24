import {
  BonusDecisionSchema,
  equityPayout,
  fullYears,
  GrantEquitySchema,
  MilestoneSchema,
  vestedPercent,
} from "@cyneform/validators";
import { describe, expect, it } from "vitest";

describe("performance bonus validation", () => {
  it("requires a positive amount when authorizing and accepts review decisions without one", () => {
    expect(
      BonusDecisionSchema.safeParse({ decision: "authorize", notes: "Approved" }).success,
    ).toBe(false);
    expect(
      BonusDecisionSchema.safeParse({ decision: "authorize", amount: 0, notes: "Approved" })
        .success,
    ).toBe(false);
    expect(
      BonusDecisionSchema.safeParse({ decision: "authorize", amount: 40_000, notes: "Approved" })
        .success,
    ).toBe(true);
    expect(
      BonusDecisionSchema.safeParse({ decision: "defer", notes: "Review next week" }).success,
    ).toBe(true);
  });
});

describe("phantom equity rules", () => {
  const grant = new Date("2025-01-15T12:00:00.000Z");
  it("uses full-year anniversary steps with a one-year cliff and a four-year maximum", () => {
    expect(fullYears(grant, new Date("2026-01-15T11:59:59.999Z"))).toBe(0);
    expect(vestedPercent(grant, new Date("2026-01-15T12:00:00.000Z"))).toBe(25);
    expect(vestedPercent(grant, new Date("2028-01-15T12:00:00.000Z"))).toBe(75);
    expect(vestedPercent(grant, new Date("2031-01-15T12:00:00.000Z"))).toBe(100);
    expect(fullYears(new Date("2026-01-01T00:00:00Z"), new Date("2025-12-31T23:59:59Z"))).toBe(0);
  });

  it("calculates the specified literal milestone formula and floors below-baseline value at zero", () => {
    expect(equityPayout(10, 25, 4_000_000, 1_000_000)).toBe(75_000);
    expect(equityPayout(15, 100, 500_000, 1_000_000)).toBe(0);
  });

  it("only accepts the configured grant percentages and positive milestone valuations", () => {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      GrantEquitySchema.safeParse({ userId, percentage: 10, reason: "Strong results" }).success,
    ).toBe(true);
    expect(
      GrantEquitySchema.safeParse({ userId, percentage: 12, reason: "Strong results" }).success,
    ).toBe(false);
    expect(MilestoneSchema.safeParse({ name: "Milestone 1", valuation: 0 }).success).toBe(false);
    expect(MilestoneSchema.safeParse({ name: "Milestone 1", valuation: 4_000_000 }).success).toBe(
      true,
    );
  });
});
