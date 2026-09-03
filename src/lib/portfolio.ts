import { db } from "@/db";
import {
  alerts as alertsTable,
  buyers as buyersTable,
  portfolioSnapshots as portfolioSnapshotsTable,
} from "@/db/schema";
import type { Buyer } from "@/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { generateDemoPortfolio } from "@/lib/demo/generator";
import { computeThresholds, generateAlerts, type AlertType } from "@/lib/risk/alerts";
import { bandFromScore, scorePortfolio, type RiskBand } from "@/lib/risk/scoring";

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

const RISK_BAND_ORDER: RiskBand[] = ["Low", "Medium", "High", "Critical"];

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

/** Recompute risk scores for the entire book (concentration needs the total). */
export async function rescoreAll(): Promise<void> {
  const rows = await db.select().from(buyersTable);
  if (rows.length === 0) return;
  const scored = scorePortfolio(rows);
  for (const result of scored) {
    const row = rows[result.index];
    if (
      row.riskScore === result.riskScore &&
      row.riskBand === result.riskBand &&
      row.scoreBreakdown?.payment === result.scoreBreakdown.payment &&
      row.scoreBreakdown?.concentration === result.scoreBreakdown.concentration
    ) {
      continue;
    }
    await db
      .update(buyersTable)
      .set({
        riskScore: result.riskScore,
        riskBand: result.riskBand,
        scoreBreakdown: result.scoreBreakdown,
      })
      .where(eq(buyersTable.id, row.id));
  }
}

/**
 * Re-run the rule engine against the current book.
 *
 * Alerts are deleted and re-inserted, so resolution state is carried across on
 * the (buyer_id, type) key. An alert the user has dealt with stays dealt with.
 */
export async function regenerateAlerts(): Promise<void> {
  const [rows, existing] = await Promise.all([
    db.select().from(buyersTable).orderBy(asc(buyersTable.id)),
    db
      .select({
        buyerId: alertsTable.buyerId,
        type: alertsTable.type,
        message: alertsTable.message,
        resolvedAt: alertsTable.resolvedAt,
      })
      .from(alertsTable)
      .where(eq(alertsTable.resolved, true)),
  ]);

  const carried = new Map(
    existing
      .filter((row) => row.resolvedAt)
      .map((row) => [
        `${row.buyerId}:${row.type}`,
        { resolvedAt: row.resolvedAt as Date, message: row.message },
      ]),
  );

  const generated = generateAlerts(rows);

  await db.delete(alertsTable);

  // Alerts the user has already actioned stay in the resolved list even when the
  // underlying rule no longer fires (e.g. the buyer has since been insured), so
  // the resolved view doubles as a record of what was done.
  const stale: { buyerId: number; type: string; message: string; resolved: boolean; resolvedAt: Date | null }[] = [];
  const generatedKeys = new Set(generated.map((alert) => `${alert.buyerId}:${alert.type}`));
  const buyerIds = new Set(rows.map((row) => row.id));
  for (const [key, carriedRow] of carried) {
    if (generatedKeys.has(key)) continue;
    const resolvedAt = carriedRow.resolvedAt;
    const [buyerId, type] = key.split(":");
    const parsedBuyerId = Number(buyerId);
    if (!buyerIds.has(parsedBuyerId)) continue;
    stale.push({
      buyerId: parsedBuyerId,
      type,
      message: carriedRow.message,
      resolved: true,
      resolvedAt,
    });
  }

  const toInsert = [
    ...generated.map((alert) => {
      const carriedRow = carried.get(`${alert.buyerId}:${alert.type}`);
      return {
        ...alert,
        resolved: Boolean(carriedRow),
        resolvedAt: carriedRow?.resolvedAt ?? null,
      };
    }),
    ...stale,
  ];

  if (toInsert.length === 0) return;
  await db.insert(alertsTable).values(toInsert);
}

/** Mark every OPEN alert on a buyer as resolved. Returns how many. */
async function autoResolveBuyerAlerts(buyerId: number): Promise<number> {
  const resolvedAt = new Date();
  const updated = await db
    .update(alertsTable)
    .set({ resolved: true, resolvedAt })
    .where(and(eq(alertsTable.buyerId, buyerId), eq(alertsTable.resolved, false)))
    .returning({ id: alertsTable.id });
  return updated.length;
}

async function loadAlerts(): Promise<{ active: AlertRow[]; resolved: AlertRow[] }> {
  const rows = await db
    .select({
      id: alertsTable.id,
      buyerId: alertsTable.buyerId,
      type: alertsTable.type,
      message: alertsTable.message,
      createdAt: alertsTable.createdAt,
      resolved: alertsTable.resolved,
      resolvedAt: alertsTable.resolvedAt,
      buyerName: buyersTable.name,
      country: buyersTable.country,
      buyerExposure: buyersTable.outstandingAmount,
      isInsured: buyersTable.isInsured,
      riskScore: buyersTable.riskScore,
      riskBand: buyersTable.riskBand,
    })
    .from(alertsTable)
    .innerJoin(buyersTable, eq(alertsTable.buyerId, buyersTable.id))
    .orderBy(desc(alertsTable.resolvedAt), desc(buyersTable.outstandingAmount))
    .limit(400);

  const mapped: AlertRow[] = rows.map((row) => ({
    id: row.id,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    country: row.country,
    buyerExposure: row.buyerExposure,
    isInsured: row.isInsured,
    riskScore: row.riskScore,
    riskBand: row.riskBand as RiskBand,
    type: row.type as AlertType,
    message: row.message,
    resolved: row.resolved,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    active: mapped.filter((row) => !row.resolved),
    resolved: mapped.filter((row) => row.resolved).slice(0, 100),
  };
}

async function loadHistory(): Promise<HistoryPoint[]> {
  const rows = await db.execute<{
    snapshot_date: string;
    insured: string;
    avg_score: string;
  }>(sql`
    select s.snapshot_date,
           b.is_insured as insured,
           round(avg(s.risk_score))::int as avg_score
    from portfolio_snapshots s
    join buyers b on b.id = s.buyer_id
    group by s.snapshot_date, b.is_insured
    order by s.snapshot_date asc
  `);

  const byDate = new Map<string, HistoryPoint>();
  for (const row of rows.rows) {
    const point = byDate.get(row.snapshot_date) ?? {
      date: row.snapshot_date,
      insuredAvg: 0,
      uninsuredAvg: 0,
      portfolioAvg: 0,
    };
    if (row.insured) point.insuredAvg = Number(row.avg_score);
    else point.uninsuredAvg = Number(row.avg_score);
    byDate.set(row.snapshot_date, point);
  }

  return Array.from(byDate.values()).map((point) => ({
    ...point,
    portfolioAvg: Math.round((point.insuredAvg + point.uninsuredAvg) / 2),
  }));
}

export async function buildPortfolioPayload(): Promise<PortfolioPayload> {
  const [rows, alertBundle, history] = await Promise.all([
    db.select().from(buyersTable).orderBy(desc(buyersTable.outstandingAmount)),
    loadAlerts(),
    loadHistory(),
  ]);

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
    missedOpportunityExposure: missedOpportunity.reduce((sum, row) => sum + row.outstandingAmount, 0),
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
   Every mutation follows the same contract: change the buyers table, let the
   rule engine re-run, then recompute the whole portfolio payload from the
   single source of truth. The client never derives anything itself, so no
   stale number can survive anywhere in the UI.
   ========================================================================== */

export type MutationOutcome = {
  portfolio: PortfolioPayload;
  resolvedAlerts: number;
};

/**
 * Improvement 1 — flip a buyer's insured status.
 * Risk scores are unaffected (they never read is_insured), but every aggregate,
 * chart and alert rule that does read it is recomputed.
 */
export async function setBuyerInsured(
  buyerId: number,
  insured: boolean,
): Promise<MutationOutcome | null> {
  const [buyer] = await db.select().from(buyersTable).where(eq(buyersTable.id, buyerId)).limit(1);
  if (!buyer) return null;
  if (buyer.isInsured === insured) {
    return { portfolio: await buildPortfolioPayload(), resolvedAlerts: 0 };
  }

  await db.update(buyersTable).set({ isInsured: insured }).where(eq(buyersTable.id, buyerId));

  const resolvedAlerts = await autoResolveBuyerAlerts(buyerId);
  await regenerateAlerts();

  return { portfolio: await buildPortfolioPayload(), resolvedAlerts };
}

/** Improvement 2 — replace a buyer's in-force policy limit. */
export async function setBuyerLimit(
  buyerId: number,
  creditLimit: number,
): Promise<MutationOutcome | null> {
  const [buyer] = await db.select().from(buyersTable).where(eq(buyersTable.id, buyerId)).limit(1);
  if (!buyer) return null;

  const nextLimit = Math.max(0, Math.round(creditLimit));
  await db
    .update(buyersTable)
    .set({ creditLimitUsed: nextLimit })
    .where(eq(buyersTable.id, buyerId));

  const resolvedAlerts = nextLimit === buyer.creditLimitUsed ? 0 : await autoResolveBuyerAlerts(buyerId);
  await regenerateAlerts();

  return { portfolio: await buildPortfolioPayload(), resolvedAlerts };
}

/** Improvement 6 — dismiss a single alert. */
export async function resolveAlertById(alertId: number): Promise<PortfolioPayload | null> {
  const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId)).limit(1);
  if (!alert) return null;
  if (!alert.resolved) {
    await db
      .update(alertsTable)
      .set({ resolved: true, resolvedAt: new Date() })
      .where(eq(alertsTable.id, alertId));
  }
  return buildPortfolioPayload();
}

/** Wipe and rebuild the synthetic demo book. */
export async function loadDemoData(seed?: number): Promise<ReturnType<typeof generateDemoPortfolio>["stats"]> {
  const generated = generateDemoPortfolio(92, seed);

  await db.delete(alertsTable);
  await db.delete(buyersTable);

  const inserted = await db.insert(buyersTable).values(generated.buyers).returning({ id: buyersTable.id });

  const snapshotRows = generated.snapshots
    .map((snapshot) => ({
      buyerId: inserted[snapshot.buyerIndex]?.id,
      snapshotDate: snapshot.snapshotDate,
      riskScore: snapshot.riskScore,
    }))
    .filter((row): row is { buyerId: number; snapshotDate: string; riskScore: number } =>
      typeof row.buyerId === "number",
    );

  for (let i = 0; i < snapshotRows.length; i += 400) {
    await db.insert(portfolioSnapshotsTable).values(snapshotRows.slice(i, i + 400));
  }

  await regenerateAlerts();
  return generated.stats;
}

export async function resetPortfolio(): Promise<void> {
  await db.delete(alertsTable);
  await db.delete(portfolioSnapshotsTable);
  await db.delete(buyersTable);
}
