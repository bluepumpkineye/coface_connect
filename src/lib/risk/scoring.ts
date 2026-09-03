import type { ScoreBreakdown } from "@/db/schema";

/**
 * ============================================================================
 * SIMULATED RISK SCORING ENGINE  ("Coface Connect score")
 * ============================================================================
 *
 * ⚠️  THIS IS AN ILLUSTRATIVE, DELIBERATELY SIMPLIFIED MODEL.
 *
 * It is NOT Coface's CUBE engine, not an actuarial model, and not a credit
 * decisioning system. It exists purely so the demo can show *how* a transparent,
 * explainable score might be produced and surfaced to a user.
 *
 * Design principles used here (mirroring how a real underwriting engine would
 * present itself):
 *   - Fully deterministic and auditable: every sub-score is visible in the UI.
 *   - Four transparent weighted factors — no black-box ML.
 *   - Same weights applied to every buyer, insured or not.
 *   - 0 = lowest risk, 100 = highest risk.
 * ============================================================================
 */

export type PaymentTrend = "improving" | "stable" | "worsening";
export type RiskBand = "Low" | "Medium" | "High" | "Critical";

export const RISK_WEIGHTS = {
  payment: 0.4,
  country: 0.2,
  industry: 0.2,
  concentration: 0.2,
} as const;

/**
 * Illustrative macro / country risk indices (0-100, higher = riskier).
 * Hand-set for the countries used in the demo dataset. These are NOT real
 * sovereign risk ratings and must not be read as such.
 */
export const COUNTRY_RISK: Record<string, number> = {
  "Hong Kong SAR": 18,
  "China (Mainland)": 44,
  Singapore: 12,
  Taiwan: 24,
  Vietnam: 55,
  Indonesia: 62,
  Thailand: 50,
  Malaysia: 34,
  Philippines: 54,
  Japan: 15,
  "South Korea": 26,
  India: 58,
  Australia: 14,
  "United States": 18,
  Germany: 15,
  "United Kingdom": 20,
  Netherlands: 16,
  "United Arab Emirates": 42,
  "Saudi Arabia": 46,
  Turkey: 74,
  Brazil: 68,
  Mexico: 55,
  Chile: 36,
  Nigeria: 85,
  "South Africa": 62,
  Poland: 30,
};

/** Fallback for any country not in the table above. */
export const DEFAULT_COUNTRY_RISK = 45;

/**
 * Illustrative sector risk indices (0-100, higher = riskier). Synthetic values
 * chosen to give the demo a believable spread across the industries used.
 */
export const INDUSTRY_RISK: Record<string, number> = {
  Manufacturing: 42,
  Trading: 52,
  Retail: 62,
  Construction: 78,
  Electronics: 46,
  "Food & Beverage": 44,
  Logistics: 36,
  Wholesale: 54,
  "Textiles & Apparel": 60,
  "Industrial Machinery": 44,
  "Building Materials": 68,
  Technology: 30,
  Healthcare: 26,
  Automotive: 50,
  "Consumer Goods": 48,
  Chemicals: 54,
};

export const DEFAULT_INDUSTRY_RISK = 48;

export const RISK_BANDS: { band: RiskBand; min: number; max: number; label: string }[] = [
  { band: "Low", min: 0, max: 25, label: "Low" },
  { band: "Medium", min: 26, max: 50, label: "Medium" },
  { band: "High", min: 51, max: 75, label: "High" },
  { band: "Critical", min: 76, max: 100, label: "Critical" },
];

/** Share of total portfolio exposure at which the concentration sub-score maxes out. */
export const CONCENTRATION_CAP_SHARE = 0.06;

export function bandFromScore(score: number): RiskBand {
  if (score >= 76) return "Critical";
  if (score >= 51) return "High";
  if (score >= 26) return "Medium";
  return "Low";
}

export function bandRange(band: RiskBand): { min: number; max: number } {
  const entry = RISK_BANDS.find((item) => item.band === band) ?? RISK_BANDS[0];
  return { min: entry.min, max: entry.max };
}

export function countryRisk(country: string): number {
  const normalised = country.trim();
  if (COUNTRY_RISK[normalised] !== undefined) return COUNTRY_RISK[normalised];
  const caseInsensitiveKey = Object.keys(COUNTRY_RISK).find(
    (key) => key.toLowerCase() === normalised.toLowerCase(),
  );
  return caseInsensitiveKey ? COUNTRY_RISK[caseInsensitiveKey] : DEFAULT_COUNTRY_RISK;
}

export function industryRisk(industry: string): number {
  const normalised = industry.trim();
  if (INDUSTRY_RISK[normalised] !== undefined) return INDUSTRY_RISK[normalised];
  const caseInsensitiveKey = Object.keys(INDUSTRY_RISK).find(
    (key) => key.toLowerCase() === normalised.toLowerCase(),
  );
  return caseInsensitiveKey ? INDUSTRY_RISK[caseInsensitiveKey] : DEFAULT_INDUSTRY_RISK;
}

/**
 * Payment behaviour sub-score.
 *
 * Anchor points for average days past terms, then a directional adjustment for
 * the observed trend. Anchors are hand-set so that:
 *   on-terms (0 days)  -> very low risk (~8)
 *   ~2 weeks late      -> moderate (~30)
 *   30 days late       -> elevated (~55, typical DSO watch point)
 *   60 days late       -> severe (~90, typical default watch point)
 *   90+ days late      -> near-certain loss (~98)
 */
const DAYS_LATE_ANCHORS: [days: number, score: number][] = [
  [0, 8],
  [15, 30],
  [30, 55],
  [45, 75],
  [60, 90],
  [90, 98],
];

const TREND_ADJUSTMENT: Record<PaymentTrend, number> = {
  improving: -14,
  stable: 0,
  worsening: +16,
};

export function paymentSubScore(avgDaysLate: number, trend: PaymentTrend): number {
  const days = Math.max(0, Number.isFinite(avgDaysLate) ? avgDaysLate : 0);

  let base: number;
  if (days <= DAYS_LATE_ANCHORS[0][0]) {
    base = DAYS_LATE_ANCHORS[0][1];
  } else if (days >= DAYS_LATE_ANCHORS[DAYS_LATE_ANCHORS.length - 1][0]) {
    base = DAYS_LATE_ANCHORS[DAYS_LATE_ANCHORS.length - 1][1];
  } else {
    base = DAYS_LATE_ANCHORS[DAYS_LATE_ANCHORS.length - 1][1];
    for (let i = 0; i < DAYS_LATE_ANCHORS.length - 1; i += 1) {
      const [d0, s0] = DAYS_LATE_ANCHORS[i];
      const [d1, s1] = DAYS_LATE_ANCHORS[i + 1];
      if (days >= d0 && days <= d1) {
        const ratio = (days - d0) / (d1 - d0);
        base = s0 + ratio * (s1 - s0);
        break;
      }
    }
  }

  const adjustment = TREND_ADJUSTMENT[trend] ?? 0;
  const adjusted = base + adjustment;
  return clamp(Math.round(adjusted), 0, 100);
}

/**
 * Exposure concentration sub-score.
 * `exposureShare` = this buyer's outstanding balance / total portfolio exposure.
 * Scaled so that 6% of the book in a single name = maximum concentration risk.
 */
export function concentrationSubScore(exposureShare: number): number {
  const share = Math.max(0, exposureShare);
  return clamp(Math.round((share / CONCENTRATION_CAP_SHARE) * 100), 0, 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type ScoringInput = {
  avgDaysLate: number;
  paymentTrend: PaymentTrend;
  country: string;
  industry: string;
  outstandingAmount: number;
  /** Total outstanding across the whole portfolio (all buyers, insured or not). */
  totalPortfolioExposure: number;
};

export type ScoringResult = {
  riskScore: number;
  riskBand: RiskBand;
  scoreBreakdown: ScoreBreakdown;
};

export function scoreBuyer(input: ScoringInput): ScoringResult {
  const payment = paymentSubScore(input.avgDaysLate, input.paymentTrend);
  const country = countryRisk(input.country);
  const industry = industryRisk(input.industry);
  const totalExposure = Math.max(1, input.totalPortfolioExposure);
  const exposureShare = clamp(input.outstandingAmount / totalExposure, 0, 1);
  const concentration = concentrationSubScore(exposureShare);

  const weighted =
    payment * RISK_WEIGHTS.payment +
    country * RISK_WEIGHTS.country +
    industry * RISK_WEIGHTS.industry +
    concentration * RISK_WEIGHTS.concentration;

  const riskScore = clamp(Math.round(weighted), 0, 100);

  return {
    riskScore,
    riskBand: bandFromScore(riskScore),
    scoreBreakdown: {
      payment,
      country,
      industry,
      concentration,
      weights: { ...RISK_WEIGHTS },
      exposureShare,
    },
  };
}

/**
 * Score a whole portfolio in one pass. Concentration depends on total exposure,
 * so the total is computed first and every buyer is then scored against it.
 */
export function scorePortfolio<
  T extends {
    avgDaysLate: number;
    paymentTrend: PaymentTrend | string;
    country: string;
    industry: string;
    outstandingAmount: number;
  },
>(rows: T[]): (ScoringResult & { index: number })[] {
  const totalExposure = rows.reduce((sum, row) => sum + (row.outstandingAmount || 0), 0);
  return rows.map((row, index) => {
    const trend: PaymentTrend =
      row.paymentTrend === "improving" || row.paymentTrend === "worsening"
        ? row.paymentTrend
        : "stable";
    return {
      ...scoreBuyer({
        avgDaysLate: row.avgDaysLate,
        paymentTrend: trend,
        country: row.country,
        industry: row.industry,
        outstandingAmount: row.outstandingAmount,
        totalPortfolioExposure: totalExposure,
      }),
      index,
    };
  });
}
