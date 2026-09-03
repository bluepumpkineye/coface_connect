import type { Buyer } from "@/db/schema";
import { bandFromScore, type RiskBand } from "./scoring";

/**
 * ============================================================================
 * RULE-BASED ALERT ENGINE (illustrative)
 * ============================================================================
 * Deterministic, explainable rules — no ML. Three families of signal:
 *   1. deterioration  — a name on the book is getting worse
 *   2. upsell         — good, uninsured, large exposure = missed opportunity
 *   3. concentration  — uninsured single-name dependency
 * ============================================================================
 */

export type AlertType = "upsell" | "deterioration" | "concentration";

export type GeneratedAlert = {
  buyerId: number;
  type: AlertType;
  message: string;
};

export type AlertThresholds = {
  /** Dollar value at the 70th percentile of exposure (top 30% of the book). */
  topExposureCutoff: number;
  /** Total outstanding across all uninsured buyers. */
  totalUninsuredExposure: number;
  /** Dollar value at which a single uninsured name trips a concentration alert. */
  concentrationThreshold: number;
  /** Share of total portfolio exposure at which concentration trips (10%). */
  concentrationShare: number;
};

export const CONCENTRATION_SHARE = 0.1;

export const ALERT_META: Record<AlertType, { label: string; action: string; blurb: string }> = {
  upsell: {
    label: "Upsell opportunity",
    action: "Add to Policy",
    blurb: "Low/medium risk, large exposure, currently uninsured",
  },
  deterioration: {
    label: "Deterioration",
    action: "Review Limit",
    blurb: "Payment behaviour worsening and band Medium or above",
  },
  concentration: {
    label: "Concentration",
    action: "Quote Cover",
    blurb: "Single uninsured name above 10% of uninsured exposure",
  },
};

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function computeThresholds(rows: Buyer[]): AlertThresholds {
  const exposures = rows.map((row) => row.outstandingAmount).sort((a, b) => a - b);
  const totalUninsuredExposure = rows
    .filter((row) => !row.isInsured)
    .reduce((sum, row) => sum + row.outstandingAmount, 0);

  return {
    topExposureCutoff: Math.round(percentile(exposures, 0.7)),
    totalUninsuredExposure,
    concentrationThreshold: Math.round(totalUninsuredExposure * CONCENTRATION_SHARE),
    concentrationShare: CONCENTRATION_SHARE,
  };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function shareOf(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function generateAlerts(rows: Buyer[]): GeneratedAlert[] {
  const thresholds = computeThresholds(rows);
  const generated: GeneratedAlert[] = [];

  for (const buyer of rows) {
    const band: RiskBand = buyer.riskBand as RiskBand;

    // ---- 1. Deterioration ------------------------------------------------
    if (
      buyer.paymentTrend === "worsening" &&
      (band === "Medium" || band === "High" || band === "Critical")
    ) {
      const coverNote = buyer.isInsured
        ? "Already on cover — consider reviewing the limit downward."
        : `Currently uninsured with ${money(buyer.outstandingAmount)} outstanding.`;
      generated.push({
        buyerId: buyer.id,
        type: "deterioration",
        message: `${buyer.name} (${buyer.country}) is ${buyer.avgDaysLate} days past terms on average and the payment trend is worsening. Current band: ${band} (${buyer.riskScore}/100). ${coverNote}`,
      });
    }

    // ---- 2. Upsell opportunity ------------------------------------------
    if (
      !buyer.isInsured &&
      (band === "Low" || band === "Medium") &&
      buyer.outstandingAmount >= thresholds.topExposureCutoff
    ) {
      generated.push({
        buyerId: buyer.id,
        type: "upsell",
        message: `${buyer.name} (${buyer.country}) is uninsured at ${band} risk (${buyer.riskScore}/100) with ${money(buyer.outstandingAmount)} outstanding — inside the top 30% of portfolio exposure. Strong candidate for incremental cover.`,
      });
    }

    // ---- 3. Concentration ------------------------------------------------
    if (
      !buyer.isInsured &&
      thresholds.totalUninsuredExposure > 0 &&
      buyer.outstandingAmount > thresholds.concentrationThreshold
    ) {
      generated.push({
        buyerId: buyer.id,
        type: "concentration",
        message: `${buyer.name} represents ${shareOf(buyer.outstandingAmount, thresholds.totalUninsuredExposure)} of total uninsured exposure (${money(buyer.outstandingAmount)} of ${money(thresholds.totalUninsuredExposure)}). A single default here would not be absorbed by the current programme.`,
      });
    }
  }

  const priority: Record<AlertType, number> = { concentration: 0, deterioration: 1, upsell: 2 };
  return generated.sort((a, b) => priority[a.type] - priority[b.type]);
}

/** Small helper used by the "Simulate Next Month" flow. */
export function bandFor(score: number): RiskBand {
  return bandFromScore(score);
}
