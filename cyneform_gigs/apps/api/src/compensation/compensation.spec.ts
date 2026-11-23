import { CloseDealSchema, calculateDealCompensation, tierFor } from "@cyneform/validators";
import { describe, expect, it } from "vitest";

describe("compensation rules", () => {
  it("uses the new monthly cumulative revenue for the whole deal tier", () => {
    expect(tierFor(500_000, [500_000, 1_000_000, 2_000_000], [25, 30, 35, 40])).toEqual({
      tier: 1,
      rate: 25,
    });
    expect(tierFor(500_000.01, [500_000, 1_000_000, 2_000_000], [25, 30, 35, 40])).toEqual({
      tier: 2,
      rate: 30,
    });
    expect(tierFor(2_000_000.01, [500_000, 1_000_000, 2_000_000], [25, 30, 35, 40])).toEqual({
      tier: 4,
      rate: 40,
    });
  });

  it("requires a positive KES project value with at most two decimals", () => {
    expect(
      CloseDealSchema.safeParse({ projectValue: 0, clientPaymentStatus: "fully_paid" }).success,
    ).toBe(false);
    expect(
      CloseDealSchema.safeParse({ projectValue: 10.001, clientPaymentStatus: "fully_paid" })
        .success,
    ).toBe(false);
    expect(
      CloseDealSchema.safeParse({ projectValue: 10.01, clientPaymentStatus: "fully_paid" }).success,
    ).toBe(true);
  });

  it("applies commission, points, rollover and the project cap in the documented order", () => {
    expect(
      calculateDealCompensation({
        cumulativeBefore: 0,
        dealValue: 100_000,
        tierLimits: [500_000, 1_000_000, 2_000_000],
        tierRates: [25, 30, 35, 40],
        pointsUsed: 51,
        kesPerPoint: 500,
        rolloverApplied: 0,
        capPhase: 1,
        capRate: 30,
      }),
    ).toMatchObject({
      cumulativeAfter: 100_000,
      tier: 1,
      commissionRate: 25,
      commissionAmount: 25_000,
      pointsValue: 25_500,
      totalBeforeCap: 50_500,
      capAmount: 30_000,
      finalPayout: 30_000,
      rolloverCreated: 20_500,
    });
  });
});
