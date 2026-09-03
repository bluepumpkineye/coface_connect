import type { AlertRecord, Buyer, PortfolioSnapshot } from "@/db/schema";
import { generateDemoPortfolio } from "@/lib/demo/generator";
import { computeThresholds, generateAlerts, type AlertType } from "@/lib/risk/alerts";
import { bandFromScore, scorePortfolio, type RiskBand } from "@/lib/risk/scoring";

/**
 * The portfolio engine.
 *
 * This was a Postgres persistence layer; it is now a pure in-memory store that
 * runs in the browser. The contract is deliberately unchanged: every mutation
 * edits the buyer book, lets the rule engine re-run, then recomputes the whole
 * payload from that single source of truth. Nothing is derived anywhere else,
 * so a stale number remains structurally impossible.
 */

export type BandCount = {
  band: RiskBand;
  insured: number;
  uninsured: number;
};

export type HistoryPoint = {
  date: string;
  insuredAvg: number;
  uninsuredAvg: number;
  portfolioAvg: number;
};

export type PortfolioSummary = {
  totalBuyers: number;
  insuredBuyers: number;
  uninsuredBuyers: number;
  pctBuyersInsured: number;
  totalExposure: number;
  insuredExposure: number;
  uninsuredExposure: number;
  pctExposureInsured: number;
  avgRiskInsured: number;
  avgRiskUninsured: number;
  avgRiskAll: number;
  bandInsured: RiskBand;
  bandUninsured: RiskBand;
  /** The headline adverse-selection gap, in risk points. */
  adverseSelectionGap: number;
  /** Uninsured names in the Low/Medium bands — the missed opportunity. */
  missedOpportunityCount: number;
  missedOpportunityExposure: number;
  /** Uninsured exposure currently sitting in High/Critical. */
  uninsuredHighRiskExposure: number;
  uninsuredHighRiskCount: number;
  bandCounts: BandCount[];
  history: HistoryPoint[];
  thresholds: ReturnType<typeof computeThresholds>;
  alertCounts: Record<AlertType, number>;
  monthsMonitored: number;
  generatedAt: string;
};

export type AlertRow = {
  id: number;
  buyerId: number;
  buyerName: string;
  country: string;
  buyerExposure: number;
  isInsured: boolean;
  riskScore: number;
  riskBand: RiskBand;
  type: AlertType;
  message: string;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
};

export type PortfolioPayload = {
  buyers: Buyer[];
  summary: PortfolioSummary;
  /** Open, un-actioned alerts. */
  alerts: AlertRow[];
  /** User-resolved alerts, most recent first (demo audit trail). */
  resolvedAlerts: AlertRow[];
};

/** The whole book. Replaces the three database tables. */
export type PortfolioState = {
  buyers: Buyer[];
  snapshots: PortfolioSnapshot[];
  alerts: AlertRecord[];
  nextAlertId: number;
};

const RISK_BAND_ORDER: RiskBand[] = ["Low", "Medium", "High", "Critical"];

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function emptyState(): PortfolioState {
  return { buyers: [], snapshots: [], alerts: [], nextAlertId: 1 };
}

/** Recompute risk scores for the entire book (concentration needs the total). */
export function rescoreAll(state: PortfolioState): void {
  if (state.buyers.length === 0) return;
  const scored = scorePortfolio(state.buyers);
  for (const result of scored) {
    const row = state.buyers[result.index];
    row.riskScore = result.riskScore;
    row.riskBand = result.riskBand;
    row.scoreBreakdown = result.scoreBreakdown;
  }
}

/**
 * Re-run the rule engine against the current book.
 *
 * Alerts are rebuilt, so resolution state is carried across on the
 * (buyerId, type) key. An alert the user has dealt with stays dealt with.
 */
export function regenerateAlerts(state: PortfolioState): void {
  const ordered = [...state.buyers].sort((a, b) => a.id - b.id);

  const carried = new Map(
    state.alerts
      .filter((row) => row.resolved && row.resolvedAt)
      .map((row) => [
        row.buyerId + ":" + row.type,
        { resolvedAt: row.resolvedAt as string, message: row.message },
      ]),
  );

  const generated = generateAlerts(ordered);
  const generatedKeys = new Set(generated.map((alert) => alert.buyerId + ":" + alert.type));
  const buyerIds = new Set(ordered.map((row) => row.id));
  const createdAt = new Date().toISOString();

  // Alerts the user has already actioned stay in the resolved list even when the
  // underlying rule no longer fires (e.g. the buyer has since been insured), so
  // the resolved view doubles as a record of what was done.
  const stale: AlertRecord[] = [];
  for (const [key, carriedRow] of carried) {
    if (generatedKeys.has(key)) continue;
    const separator = key.indexOf(":");
    const parsedBuyerId = Number(key.slice(0, separator));
    const type = key.slice(separator + 1);
    if (!buyerIds.has(parsedBuyerId)) continue;
    stale.push({
      id: state.nextAlertId++,
      buyerId: parsedBuyerId,
      type,
      message: carriedRow.message,
      resolved: true,
      resolvedAt: carriedRow.resolvedAt,
      createdAt,
    });
  }

  state.alerts = [
    ...generated.map((alert) => {
      const carriedRow = carried.get(alert.buyerId + ":" + alert.type);
      return {
        id: state.nextAlertId++,
        buyerId: alert.buyerId,
        type: alert.type,
        message: alert.message,
        resolved: Boolean(carriedRow),
        resolvedAt: carriedRow?.resolvedAt ?? null,
        createdAt,
      };
    }),
    ...stale,
  ];
}

/** Mark every OPEN alert on a buyer as resolved. Returns how many. */
function autoResolveBuyerAlerts(state: PortfolioState, buyerId: number): number {
  const resolvedAt = new Date().toISOString();
  let count = 0;
  for (const alert of state.alerts) {
    if (alert.buyerId === buyerId && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = resolvedAt;
      count += 1;
    }
  }
  return count;
}

function loadAlerts(state: PortfolioState): { active: AlertRow[]; resolved: AlertRow[] } {
  const byId = new Map(state.buyers.map((buyer) => [buyer.id, buyer]));

  const joined = state.alerts
    .map((alert) => {
      const buyer = byId.get(alert.buyerId);
      return buyer ? { alert, buyer } : null;
    })
    .filter((row): row is { alert: AlertRecord; buyer: Buyer } => row !== null);

  // Matches the old ORDER BY resolved_at DESC, outstanding_amount DESC — in
  // Postgres a DESC sort puts NULLs first, so open alerts lead the list.
  joined.sort((a, b) => {
    const aResolved = a.alert.resolvedAt;
    const bResolved = b.alert.resolvedAt;
    if (aResolved !== bResolved) {
      if (!aResolved) return -1;
      if (!bResolved) return 1;
      if (aResolved > bResolved) return -1;
      if (aResolved < bResolved) return 1;
    }
    return b.buyer.outstandingAmount - a.buyer.outstandingAmount;
  });

  const mapped: AlertRow[] = joined.slice(0, 400).map(({ alert, buyer }) => ({
    id: alert.id,
    buyerId: alert.buyerId,
    buyerName: buyer.name,
    country: buyer.country,
    buyerExposure: buyer.outstandingAmount,
    isInsured: buyer.isInsured,
    riskScore: buyer.riskScore,
    riskBand: buyer.riskBand as RiskBand,
    type: alert.type as AlertType,
    message: alert.message,
    resolved: alert.resolved,
    resolvedAt: alert.resolvedAt,
    createdAt: alert.createdAt,
  }));

  return {
    active: mapped.filter((row) => !row.resolved),
    resolved: mapped.filter((row) => row.resolved).slice(0, 100),
  };
}

function loadHistory(state: PortfolioState): HistoryPoint[] {
  const insuredById = new Map(state.buyers.map((buyer) => [buyer.id, buyer.isInsured]));

  const buckets = new Map<string, { insured: number[]; uninsured: number[] }>();
  for (const snapshot of state.snapshots) {
    const isInsured = insuredById.get(snapshot.buyerId);
    if (isInsured === undefined) continue;
    const bucket = buckets.get(snapshot.snapshotDate) ?? { insured: [], uninsured: [] };
    if (isInsured) bucket.insured.push(snapshot.riskScore);
    else bucket.uninsured.push(snapshot.riskScore);
    buckets.set(snapshot.snapshotDate, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => {
      const insuredAvg = avg(bucket.insured);
      const uninsuredAvg = avg(bucket.uninsured);
      return {
        date,
        insuredAvg,
        uninsuredAvg,
        portfolioAvg: Math.round((insuredAvg + uninsuredAvg) / 2),
      };
    });
}

export function buildPortfolioPayload(state: PortfolioState): PortfolioPayload {
  const rows = [...state.buyers].sort((a, b) => b.outstandingAmount - a.outstandingAmount);
  const alertBundle = loadAlerts(state);
  const history = loadHistory(state);

  const alertRows = alertBundle.active;

  const insured = rows.filter((row) => row.isInsured);
  const uninsured = rows.filter((row) => !row.isInsured);

  const totalExposure = rows.reduce((sum, row) => sum + row.outstandingAmount, 0);
  const insuredExposure = insured.reduce((sum, row) => sum + row.outstandingAmount, 0);
  const uninsuredExposure = uninsured.reduce((sum, row) => sum + row.outstandingAmount, 0);

  const avgRiskInsured = avg(insured.map((row) => row.riskScore));
  const avgRiskUninsured = avg(uninsured.map((row) => row.riskScore));

  const bandCounts: BandCount[] = RISK_BAND_ORDER.map((band) => ({
    band,
    insured: insured.filter((row) => row.riskBand === band).length,
    uninsured: uninsured.filter((row) => row.riskBand === band).length,
  }));

  const missedOpportunity = uninsured.filter(
    (row) => row.riskBand === "Low" || row.riskBand === "Medium",
  );
  const uninsuredHighRisk = uninsured.filter(
    (row) => row.riskBand === "High" || row.riskBand === "Critical",
  );

  const alertCounts: Record<AlertType, number> = { upsell: 0, deterioration: 0, concentration: 0 };
  for (const alert of alertRows) {
    if (alertCounts[alert.type] !== undefined) alertCounts[alert.type] += 1;
  }

  const summary: PortfolioSummary = {
    totalBuyers: rows.length,
    insuredBuyers: insured.length,
    uninsuredBuyers: uninsured.length,
    pctBuyersInsured: pct(insured.length, rows.length),
    totalExposure,
    insuredExposure,
    uninsuredExposure,
    pctExposureInsured: pct(insuredExposure, totalExposure),
    avgRiskInsured,
    avgRiskUninsured,
    avgRiskAll: avg(rows.map((row) => row.riskScore)),
    bandInsured: bandFromScore(avgRiskInsured),
    bandUninsured: bandFromScore(avgRiskUninsured),
    adverseSelectionGap: avgRiskInsured - avgRiskUninsured,
    missedOpportunityCount: missedOpportunity.length,
    missedOpportunityExposure: missedOpportunity.reduce(
      (sum, row) => sum + row.outstandingAmount,
      0,
    ),
    uninsuredHighRiskCount: uninsuredHighRisk.length,
    uninsuredHighRiskExposure: uninsuredHighRisk.reduce(
      (sum, row) => sum + row.outstandingAmount,
      0,
    ),
    bandCounts,
    history,
    thresholds: computeThresholds(rows),
    alertCounts,
    monthsMonitored: history.length,
    generatedAt: new Date().toISOString(),
  };

  return {
    buyers: rows,
    summary,
    alerts: alertRows,
    resolvedAlerts: alertBundle.resolved,
  };
}

/* ==========================================================================
   LIVE MUTATIONS
   --------------------------------------------------------------------------
   Every mutation follows the same contract: change the buyer book, let the
   rule engine re-run, then recompute the whole portfolio payload from the
   single source of truth. The UI never derives anything itself, so no stale
   number can survive anywhere.
   ========================================================================== */

export type MutationOutcome = {
  portfolio: PortfolioPayload;
  resolvedAlerts: number;
};

/**
 * Improvement 1 — flip a buyer's insured status.
 * Risk scores are unaffected (they never read isInsured), but every aggregate,
 * chart and alert rule that does read it is recomputed.
 */
export function setBuyerInsured(
  state: PortfolioState,
  buyerId: number,
  insured: boolean,
): MutationOutcome | null {
  const buyer = state.buyers.find((row) => row.id === buyerId);
  if (!buyer) return null;
  if (buyer.isInsured === insured) {
    return { portfolio: buildPortfolioPayload(state), resolvedAlerts: 0 };
  }

  buyer.isInsured = insured;

  const resolvedAlerts = autoResolveBuyerAlerts(state, buyerId);
  regenerateAlerts(state);

  return { portfolio: buildPortfolioPayload(state), resolvedAlerts };
}

/** Improvement 2 — replace a buyer's in-force policy limit. */
export function setBuyerLimit(
  state: PortfolioState,
  buyerId: number,
  creditLimit: number,
): MutationOutcome | null {
  const buyer = state.buyers.find((row) => row.id === buyerId);
  if (!buyer) return null;

  const nextLimit = Math.max(0, Math.round(creditLimit));
  const unchanged = nextLimit === buyer.creditLimitUsed;
  buyer.creditLimitUsed = nextLimit;

  const resolvedAlerts = unchanged ? 0 : autoResolveBuyerAlerts(state, buyerId);
  regenerateAlerts(state);

  return { portfolio: buildPortfolioPayload(state), resolvedAlerts };
}

/** Improvement 6 — dismiss a single alert. */
export function resolveAlertById(
  state: PortfolioState,
  alertId: number,
): PortfolioPayload | null {
  const alert = state.alerts.find((row) => row.id === alertId);
  if (!alert) return null;
  if (!alert.resolved) {
    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();
  }
  return buildPortfolioPayload(state);
}

/** Wipe and rebuild the synthetic demo book. */
export function loadDemoData(
  state: PortfolioState,
  seed?: number,
): ReturnType<typeof generateDemoPortfolio>["stats"] {
  const generated = generateDemoPortfolio(92, seed);
  const createdAt = new Date().toISOString();

  state.buyers = generated.buyers.map((buyer, index) => ({
    id: index + 1,
    name: buyer.name,
    country: buyer.country,
    industry: buyer.industry,
    outstandingAmount: buyer.outstandingAmount,
    creditLimitUsed: buyer.creditLimitUsed ?? 0,
    creditLimitRequested: buyer.creditLimitRequested ?? 0,
    avgDaysLate: buyer.avgDaysLate ?? 0,
    paymentTrend: buyer.paymentTrend ?? "stable",
    isInsured: buyer.isInsured ?? false,
    buyerSince: buyer.buyerSince,
    riskScore: buyer.riskScore ?? 0,
    riskBand: buyer.riskBand ?? "Low",
    scoreBreakdown: buyer.scoreBreakdown ?? null,
    createdAt,
  }));

  state.snapshots = generated.snapshots
    .map((snapshot) => ({
      buyerId: state.buyers[snapshot.buyerIndex]?.id,
      snapshotDate: snapshot.snapshotDate,
      riskScore: snapshot.riskScore,
    }))
    .filter((row): row is PortfolioSnapshot => typeof row.buyerId === "number");

  state.alerts = [];
  state.nextAlertId = 1;
  regenerateAlerts(state);

  return generated.stats;
}

export function resetPortfolio(state: PortfolioState): void {
  state.buyers = [];
  state.snapshots = [];
  state.alerts = [];
  state.nextAlertId = 1;
}
