/**
 * Coface Connect — DEMO data model.
 *
 * Everything here is synthetic demo data. There is no connection to any real
 * Coface system, and none of these figures represent real companies.
 *
 * These were Drizzle/Postgres table definitions. The demo generates its whole
 * book deterministically from a seed, so there is nothing worth persisting that
 * cannot be rebuilt instantly — and a serverless host has no durable disk or
 * database to persist it to anyway. They are now plain TypeScript types and the
 * book lives in memory in the browser. The field names and shapes are unchanged.
 */

export type ScoreBreakdown = {
  payment: number;
  country: number;
  industry: number;
  concentration: number;
  /** Weighted contributions actually applied to the final score. */
  weights: { payment: number; country: number; industry: number; concentration: number };
  /** Share of total portfolio exposure used for the concentration sub-score. */
  exposureShare: number;
};

export type Buyer = {
  id: number;
  name: string;
  country: string;
  industry: string;
  /** Outstanding AR balance, in whole USD. */
  outstandingAmount: number;
  creditLimitUsed: number;
  creditLimitRequested: number;
  avgDaysLate: number;
  /** improving | stable | worsening */
  paymentTrend: string;
  isInsured: boolean;
  buyerSince: string;
  riskScore: number;
  /** Low | Medium | High | Critical */
  riskBand: string;
  scoreBreakdown: ScoreBreakdown | null;
  /** ISO timestamp. */
  createdAt: string;
};

/** Fields that previously carried a column default are optional here too. */
export type NewBuyer = Omit<
  Buyer,
  | "id"
  | "createdAt"
  | "creditLimitUsed"
  | "creditLimitRequested"
  | "avgDaysLate"
  | "paymentTrend"
  | "isInsured"
  | "riskScore"
  | "riskBand"
  | "scoreBreakdown"
> & {
  id?: number;
  createdAt?: string;
  creditLimitUsed?: number;
  creditLimitRequested?: number;
  avgDaysLate?: number;
  paymentTrend?: string;
  isInsured?: boolean;
  riskScore?: number;
  riskBand?: string;
  scoreBreakdown?: ScoreBreakdown | null;
};

export type PortfolioSnapshot = {
  buyerId: number;
  snapshotDate: string;
  riskScore: number;
};

export type AlertRecord = {
  id: number;
  buyerId: number;
  /** upsell | deterioration | concentration */
  type: string;
  message: string;
  /**
   * User-dismissed alerts. Resolution is keyed on (buyerId, type) and carried
   * across regenerations so refreshing the ledger does not resurrect an alert
   * somebody has already dealt with.
   */
  resolved: boolean;
  /** ISO timestamp. */
  resolvedAt: string | null;
  /** ISO timestamp. */
  createdAt: string;
};
