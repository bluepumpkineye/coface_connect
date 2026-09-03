import type { Buyer } from "@/db/schema";
import type { AlertRow, PortfolioSummary } from "@/lib/portfolio";
import type { RiskBand } from "@/lib/risk/scoring";

/**
 * Client-side mirrors of the API payload types. The only difference from the
 * Drizzle row types is that `createdAt` arrives as an ISO string over JSON.
 */
export type ClientBuyer = Omit<Buyer, "createdAt"> & { createdAt: string };

export type PortfolioData = {
  buyers: ClientBuyer[];
  summary: PortfolioSummary;
  /** Open, un-actioned alerts. */
  alerts: AlertRow[];
  /** User-resolved alerts, most recent first. */
  resolvedAlerts: AlertRow[];
};

export type IngestionSummary = {
  loaded: number;
  skipped: number;
  insuredCount: number;
  insuredPct: number;
  totalExposure: number;
};

export type AssessmentPayload = {
  assessment: {
    buyerId: number;
    buyerName: string;
    country: string;
    industry: string;
    riskScore: number;
    riskBand: "Low" | "Medium" | "High" | "Critical";
    requestedExposure: number;
    currentLimit: number;
    suggestedCreditLimit: number;
    limitUtilisation: number;
    premiumRateLow: number;
    premiumRateHigh: number;
    premiumLow: number;
    premiumHigh: number;
    drivers: { label: string; value: string; weight: string; detail: string }[];
    turnaroundHours: number;
    generatedAt: string;
  };
  buyer: { id: number; name: string; isInsured: boolean };
};

/**
 * Improvement 5 — drill-down filter contract.
 * `label` records where the filter came from so the chip above the ledger can
 * say e.g. "Uninsured · High/Critical risk".
 */
export type LedgerFilter = {
  insured: "all" | "insured" | "uninsured";
  bands: RiskBand[];
  label: string | null;
};

export const LEDGER_DEFAULT_FILTER: LedgerFilter = {
  insured: "all",
  bands: [],
  label: null,
};

/** Shared action styling: teal = new coverage, amber = re-assessment. */
export function policyActionFor(isInsured: boolean): {
  label: string;
  variant: "teal" | "amber";
} {
  return isInsured
    ? { label: "Re-assess", variant: "amber" }
    : { label: "Get Instant Assessment", variant: "teal" };
}
