import type { Buyer } from "@/db/schema";
import { bandFromScore, type RiskBand } from "./scoring";

/**
 * ============================================================================
 * INSTANT COVERAGE RECOMMENDATION (illustrative pricing logic)
 * ============================================================================
 * Simple, transparent heuristics. NOT a real premium quotation, NOT actuarial,
 * and NOT connected to any Coface pricing system. The point of this screen is
 * to contrast a same-day indicative answer with a multi-week government agency
 * turnaround.
 * ============================================================================
 */

export type Assessment = {
  buyerId: number;
  buyerName: string;
  country: string;
  industry: string;
  riskScore: number;
  riskBand: RiskBand;
  requestedExposure: number;
  /** Limit currently in force on the policy (0 when uninsured). */
  currentLimit: number;
  suggestedCreditLimit: number;
  limitUtilisation: number;
  premiumRateLow: number;
  premiumRateHigh: number;
  premiumLow: number;
  premiumHigh: number;
  /** Weighted drivers surfaced to the user so the number is explainable. */
  drivers: { label: string; value: string; weight: string; detail: string }[];
  turnaroundHours: number;
  generatedAt: string;
};

/** Share of the requested exposure we are willing to indemnify, by band. */
const LIMIT_FACTOR: Record<RiskBand, number> = {
  Low: 0.9,
  Medium: 0.7,
  High: 0.45,
  Critical: 0.2,
};

/** Indicative premium as a % of the covered limit, by band. */
export const PREMIUM_RATES: Record<RiskBand, [low: number, high: number]> = {
  Low: [0.003, 0.005],
  Medium: [0.006, 0.01],
  High: [0.012, 0.02],
  Critical: [0.025, 0.04],
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function buildAssessment(buyer: Buyer): Assessment {
  const riskBand = bandFromScore(buyer.riskScore);
  const requested =
    buyer.creditLimitRequested > 0 ? buyer.creditLimitRequested : buyer.outstandingAmount;
  const factor = LIMIT_FACTOR[riskBand];
  const suggestedCreditLimit = Math.max(
    5000,
    roundTo(Math.min(requested, requested * factor + 25000), 5000),
  );
  const [rateLow, rateHigh] = PREMIUM_RATES[riskBand];

  const breakdown = buyer.scoreBreakdown;
  const drivers: Assessment["drivers"] = [
    {
      label: "Payment behaviour",
      value: `${breakdown?.payment ?? 0}/100`,
      weight: "40%",
      detail: `${buyer.avgDaysLate} days past terms, trend ${buyer.paymentTrend}`,
    },
    {
      label: "Country risk",
      value: `${breakdown?.country ?? 0}/100`,
      weight: "20%",
      detail: buyer.country,
    },
    {
      label: "Industry risk",
      value: `${breakdown?.industry ?? 0}/100`,
      weight: "20%",
      detail: buyer.industry,
    },
    {
      label: "Concentration",
      value: `${breakdown?.concentration ?? 0}/100`,
      weight: "20%",
      detail: `${((breakdown?.exposureShare ?? 0) * 100).toFixed(1)}% of portfolio exposure`,
    },
  ];

  return {
    buyerId: buyer.id,
    buyerName: buyer.name,
    country: buyer.country,
    industry: buyer.industry,
    riskScore: buyer.riskScore,
    riskBand,
    requestedExposure: requested,
    currentLimit: buyer.creditLimitUsed,
    suggestedCreditLimit,
    limitUtilisation: requested > 0 ? suggestedCreditLimit / requested : 0,
    premiumRateLow: rateLow,
    premiumRateHigh: rateHigh,
    premiumLow: Math.round(suggestedCreditLimit * rateLow),
    premiumHigh: Math.round(suggestedCreditLimit * rateHigh),
    drivers,
    turnaroundHours: 4,
    generatedAt: new Date().toISOString(),
  };
}
