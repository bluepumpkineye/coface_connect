import { db } from "@/db";
import { buyers as buyersTable, portfolioSnapshots } from "@/db/schema";
import { sql } from "drizzle-orm";
import { buildPortfolioPayload, regenerateAlerts, rescoreAll } from "@/lib/portfolio";
import type { PaymentTrend } from "@/lib/risk/scoring";

export const dynamic = "force-dynamic";

export type IngestRow = Record<string, unknown>;

/**
 * Accepts camelCase, snake_case or space-separated headers and returns a
 * normalised record keyed by the camelCase Buyer field names. That way the same
 * endpoint works for the browser column-mapper (snake_case template fields) and
 * for ad-hoc API calls.
 */
function normaliseRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const parts = rawKey.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (parts.length === 0) continue;
    const camel = parts
      .map((part, index) =>
        index === 0
          ? part.toLowerCase()
          : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
      )
      .join("");
    if (result[camel] === undefined) result[camel] = value;
  }
  return result;
}


function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    return ["y", "yes", "true", "1", "insured", "covered"].includes(lowered);
  }
  return false;
}

function toTrend(value: unknown): PaymentTrend {
  const lowered = String(value ?? "").trim().toLowerCase();
  if (lowered.startsWith("improv")) return "improving";
  if (lowered.startsWith("worsen") || lowered.startsWith("deterior")) return "worsening";
  return "stable";
}

function toDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "2020-01-01";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rows?: IngestRow[]; replace?: boolean };
    const rows = (Array.isArray(body?.rows) ? body.rows : []).map(normaliseRow);
    if (rows.length === 0) {
      return Response.json({ error: "No rows supplied" }, { status: 400 });
    }
    if (rows.length > 2000) {
      return Response.json({ error: "Maximum 2000 rows per upload" }, { status: 400 });
    }

    const prepared = rows
      .map((row) => {
        const name = String(row.buyerName ?? row.name ?? "").trim();
        if (!name) return null;
        const outstandingAmount = Math.round(
          toNumber(row.outstandingAmount ?? row.outstanding ?? row.balance) ?? 0,
        );
        if (outstandingAmount <= 0) return null;
        const avgDaysLate = Math.max(
          0,
          Math.round(toNumber(row.avgDaysLate ?? row.daysLate) ?? 0),
        );
        const creditLimitUsed = Math.max(0, Math.round(toNumber(row.creditLimitUsed) ?? 0));
        const creditLimitRequested = Math.max(
          0,
          Math.round(
            toNumber(row.creditLimitRequested ?? row.creditLimit) ??
              Math.round(outstandingAmount * 1.2),
          ),
        );
        return {
          name: name.slice(0, 160),
          country: String(row.country ?? "Unknown").trim().slice(0, 80) || "Unknown",
          industry: String(row.industry ?? row.sector ?? "Unknown").trim().slice(0, 80) || "Unknown",
          outstandingAmount,
          creditLimitUsed,
          creditLimitRequested,
          avgDaysLate,
          paymentTrend: toTrend(row.paymentTrend ?? row.trend),
          isInsured: toBoolean(row.isInsured ?? row.insured),
          buyerSince: toDate(row.buyerSince ?? row.since),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (prepared.length === 0) {
      return Response.json(
        { error: "No valid rows — every row needs a buyer name and an outstanding amount." },
        { status: 400 },
      );
    }

    if (body?.replace) {
      await db.delete(portfolioSnapshots);
      await db.delete(buyersTable);
    }

    const inserted = await db.insert(buyersTable).values(prepared).returning({ id: buyersTable.id });

    const month = new Date().toISOString().slice(0, 10);
    const snapshotRows = inserted.map((row) => ({
      buyerId: row.id,
      snapshotDate: month,
      riskScore: 0,
    }));
    for (let i = 0; i < snapshotRows.length; i += 400) {
      await db.insert(portfolioSnapshots).values(snapshotRows.slice(i, i + 400));
    }

    await rescoreAll();

    // Snapshots were written before scoring, so backfill the real scores.
    await db.execute(sql`update portfolio_snapshots s
      set risk_score = b.risk_score
      from buyers b
      where b.id = s.buyer_id and s.snapshot_date = ${month}`);

    await regenerateAlerts();

    const payload = await buildPortfolioPayload();
    const insuredCount = payload.buyers.filter((buyer) => buyer.isInsured).length;

    return Response.json({
      ingestion: {
        loaded: prepared.length,
        skipped: rows.length - prepared.length,
        insuredCount,
        insuredPct: payload.summary.pctBuyersInsured,
        totalExposure: payload.summary.totalExposure,
      },
      ...payload,
    });
  } catch (error) {
    console.error("Ingestion failed", error);
    return Response.json({ error: "Ingestion failed" }, { status: 500 });
  }
}
