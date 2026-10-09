import { describe, expect, it } from "vitest";
import {
  breakEvenPurchases,
  contributionCents
} from "../shared/unit-economics.js";

const PURCHASE = Object.freeze({
  grossCents: 599,
  feeCents: 47,
  refundLossCents: 18,
  serviceCents: 25,
  provisionCents: 75
});

describe("Unit economics", () => {
  it("US-11.1 gives a Contribution of 434 cents for the reference purchase", () => {
    expect(contributionCents(PURCHASE)).toBe(434);
  });

  it("US-11.2 rounds break-even up to the next whole purchase", () => {
    expect(breakEvenPurchases({ fixedCents: 10_000, contributionCents: 434 })).toBe(24);
    expect(breakEvenPurchases({ fixedCents: 868, contributionCents: 434 })).toBe(2);
    expect(breakEvenPurchases({ fixedCents: 869, contributionCents: 434 })).toBe(3);
    expect(breakEvenPurchases({ fixedCents: 0, contributionCents: 434 })).toBe(0);
  });

  it("US-11.3 gives no break-even when a purchase contributes nothing", () => {
    expect(breakEvenPurchases({ fixedCents: 10_000, contributionCents: 0 })).toBeNull();
    expect(breakEvenPurchases({ fixedCents: 10_000, contributionCents: -1 })).toBeNull();
    expect(
      contributionCents({ ...PURCHASE, provisionCents: 600 })
    ).toBe(-91);
  });

  it("US-11.5 rejects inputs whose Contribution has no exact integer value", () => {
    expect(() =>
      contributionCents({
        grossCents: 0,
        feeCents: Number.MAX_SAFE_INTEGER,
        refundLossCents: Number.MAX_SAFE_INTEGER,
        serviceCents: 0,
        provisionCents: 0
      })
    ).toThrow(RangeError);
  });

  it("US-11.4 returns equal outputs for equal inputs and changes no input", () => {
    const purchase = { ...PURCHASE };
    const period = { fixedCents: 10_000, contributionCents: 434 };

    expect(contributionCents(purchase)).toBe(contributionCents(purchase));
    expect(breakEvenPurchases(period)).toBe(breakEvenPurchases(period));
    expect(purchase).toEqual(PURCHASE);
    expect(period).toEqual({ fixedCents: 10_000, contributionCents: 434 });
  });

  it("US-11.5 rejects a fraction or a negative cent value", () => {
    for (const field of Object.keys(PURCHASE)) {
      expect(() => contributionCents({ ...PURCHASE, [field]: 1.5 })).toThrow(
        RangeError
      );
      expect(() => contributionCents({ ...PURCHASE, [field]: -1 })).toThrow(
        RangeError
      );
    }
    expect(() =>
      breakEvenPurchases({ fixedCents: -1, contributionCents: 434 })
    ).toThrow(RangeError);
    expect(() =>
      breakEvenPurchases({ fixedCents: 10.5, contributionCents: 434 })
    ).toThrow(RangeError);
    expect(() =>
      breakEvenPurchases({ fixedCents: 100, contributionCents: 4.5 })
    ).toThrow(RangeError);
  });
});
