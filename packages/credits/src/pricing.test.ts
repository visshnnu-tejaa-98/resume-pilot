import { describe, expect, it } from "vitest";
import {
  aiCostInr,
  calculateCredits,
  creditsForCostInr,
  UnknownModelError,
  type PricingConfig,
} from "./index";

const config: PricingConfig = {
  version: 7,
  modelPrices: {
    "gpt-5.1": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10, cachedInputPerMillionUsd: 0.25 },
    "gpt-5.1-mini": { inputPerMillionUsd: 0.5, outputPerMillionUsd: 2 },
  },
  actionSettings: {
    jd_analysis: { model: "gpt-5.1", promptOverheadTokens: 1500, maxOutputTokens: 2000 },
    generation: { model: "gpt-5.1", promptOverheadTokens: 2500, maxOutputTokens: 6000 },
    ats_scoring: { model: "gpt-5.1", promptOverheadTokens: 2000, maxOutputTokens: 2500 },
  },
  usdToInrRate: 83,
  markupMultiplier: 3,
  minimumCreditsPerAction: 50,
  creditValueInr: 0.05,
};

describe("aiCostInr", () => {
  it("prices input + output tokens and converts USD to INR", () => {
    // (4000 × 2.5 + 2000 × 10) / 1M = $0.03 → × 83 = ₹2.49
    expect(aiCostInr(config, "gpt-5.1", { inputTokens: 4000, outputTokens: 2000 })).toBeCloseTo(
      2.49,
      10,
    );
  });

  it("bills cached input at the cached price", () => {
    // 1000 uncached × 2.5 + 3000 cached × 0.25 = 3250 → $0.00325 → ₹0.26975
    const cost = aiCostInr(config, "gpt-5.1", {
      inputTokens: 4000,
      cachedInputTokens: 3000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.26975, 10);
  });

  it("falls back to the input price when a model has no cached price", () => {
    const withCache = aiCostInr(config, "gpt-5.1-mini", {
      inputTokens: 1000,
      cachedInputTokens: 1000,
      outputTokens: 0,
    });
    const withoutCache = aiCostInr(config, "gpt-5.1-mini", { inputTokens: 1000, outputTokens: 0 });
    expect(withCache).toBe(withoutCache);
  });

  it("throws UnknownModelError naming the model and config version", () => {
    expect(() => aiCostInr(config, "gpt-9", { inputTokens: 1, outputTokens: 1 })).toThrow(
      UnknownModelError,
    );
    expect(() => aiCostInr(config, "gpt-9", { inputTokens: 1, outputTokens: 1 })).toThrow(/v7/);
  });

  it.each([
    { inputTokens: -1, outputTokens: 0 },
    { inputTokens: 1.5, outputTokens: 0 },
    { inputTokens: 0, outputTokens: Number.NaN },
    { inputTokens: 10, outputTokens: 0, cachedInputTokens: 11 },
  ])("rejects invalid usage %o", (usage) => {
    expect(() => aiCostInr(config, "gpt-5.1", usage)).toThrow(RangeError);
  });
});

describe("creditsForCostInr", () => {
  it("applies ceil((cost × markup) / credit value)", () => {
    // 2.49 × 3 / 0.05 = 149.4 → 150
    expect(creditsForCostInr(config, 2.49)).toBe(150);
  });

  it("does not overcharge by one credit from float noise on exact results", () => {
    // 1 × 3 / 0.05 = 60 exactly, but in floats it's 59.99999999999999 or 60.00000000000001
    expect(creditsForCostInr(config, 1)).toBe(60);
    expect(
      creditsForCostInr({ ...config, markupMultiplier: 0.3, minimumCreditsPerAction: 0 }, 0.1 * 3),
    ).toBe(2);
  });

  it("enforces the minimum charge per action", () => {
    expect(creditsForCostInr(config, 0)).toBe(50);
    expect(creditsForCostInr(config, 0.01)).toBe(50);
  });

  it("scales with markup — changing config changes the charge, no code change", () => {
    expect(creditsForCostInr({ ...config, markupMultiplier: 4 }, 2.49)).toBe(200); // 199.2 → 200
    expect(creditsForCostInr({ ...config, markupMultiplier: 2 }, 2.49)).toBe(100); // 99.6 → 100
  });

  it("uses the configured credit value", () => {
    expect(creditsForCostInr({ ...config, creditValueInr: 0.1 }, 2.49)).toBe(75); // 74.7 → 75
  });

  it("rejects negative or non-finite cost", () => {
    expect(() => creditsForCostInr(config, -1)).toThrow(RangeError);
    expect(() => creditsForCostInr(config, Infinity)).toThrow(RangeError);
  });
});

describe("calculateCredits", () => {
  it("returns credits, cost and the config version used", () => {
    expect(calculateCredits(config, "gpt-5.1", { inputTokens: 4000, outputTokens: 2000 })).toEqual({
      credits: 150,
      costInr: expect.closeTo(2.49, 10),
      costPaise: 249,
      pricingConfigVersion: 7,
    });
  });

  it("rounds cost up to whole paise", () => {
    const result = calculateCredits(config, "gpt-5.1", { inputTokens: 1, outputTokens: 0 });
    expect(result.costPaise).toBe(1);
  });

  it("an estimate with a bigger output budget is never below the actual charge", () => {
    const estimate = calculateCredits(config, "gpt-5.1", { inputTokens: 5000, outputTokens: 4000 });
    for (const actualOut of [0, 1, 999, 2500, 4000]) {
      const actual = calculateCredits(config, "gpt-5.1", {
        inputTokens: 5000,
        outputTokens: actualOut,
      });
      expect(actual.credits).toBeLessThanOrEqual(estimate.credits);
    }
  });
});
