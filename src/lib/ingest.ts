import type { Buyer } from "@/db/schema";
import {
  buildPortfolioPayload,
  regenerateAlerts,
  rescoreAll,
  type PortfolioPayload,
  type PortfolioState,
} from "@/lib/portfolio";
import type { PaymentTrend } from "@/lib/risk/scoring";
import type { IngestionSummary } from "@/lib/types";

export type IngestRow = Record<string, unknown>;

/**
 * Accepts camelCase, snake_case or space-separated headers and returns a
 * normalised record keyed by the camelCase Buyer field names, so the same code
 * path works for the browser column-mapper and for ad-hoc pasted data.
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

export type IngestResult = {
  ingestion: IngestionSummary;
  portfolio: PortfolioPayload;
};

export class IngestError extends Error {}

export function ingestRows(
  state: PortfolioState,
  rawRows: IngestRow[],
  replace: boolean,
  clientName?: string,
): IngestResult {
  const rows = (Array.isArray(rawRows) ? rawRows : []).map(normaliseRow);
  if (rows.length === 0) throw new IngestError("No rows supplied");
  if (rows.length > 2000) throw new IngestError("Maximum 2000 rows per upload");

  const prepared = rows
    .map((row) => {
      const name = String(row.buyerName ?? row.name ?? "").trim();
      if (!name) return null;
      const outstandingAmount = Math.round(
        toNumber(row.outstandingAmount ?? row.outstanding ?? row.balance) ?? 0,
      );
      if (outstandingAmount <= 0) return null;
      const avgDaysLate = Math.max(0, Math.round(toNumber(row.avgDaysLate ?? row.daysLate) ?? 0));
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
    throw new IngestError(
      "No valid rows — every row needs a buyer name and an outstanding amount.",
    );
  }

  // An uploaded ledger belongs to whoever the user names, so the rest of the
  // demo policyholder is cleared rather than inherited — otherwise the upload
  // would carry the demo country and policy reference under a new name.
  const trimmedClient = clientName?.trim();
  if (trimmedClient) {
    state.policyholder = {
      name: trimmedClient,
      country: "—",
      industry: "—",
      policyRef: "—",
      clientSince: "",
    };
  }

  if (replace) {
    state.buyers = [];
    state.snapshots = [];
    state.alerts = [];
    state.nextAlertId = 1;
  }

  const createdAt = new Date().toISOString();
  let nextId = state.buyers.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const added: Buyer[] = prepared.map((row) => ({
    ...row,
    id: nextId++,
    riskScore: 0,
    riskBand: "Low",
    scoreBreakdown: null,
    createdAt,
  }));

  state.buyers = [...state.buyers, ...added];

  rescoreAll(state);

  // Snapshots are written after scoring so the new month carries real scores.
  const month = createdAt.slice(0, 10);
  state.snapshots = [
    ...state.snapshots.filter((snapshot) => snapshot.snapshotDate !== month),
    ...state.buyers.map((row) => ({
      buyerId: row.id,
      snapshotDate: month,
      riskScore: row.riskScore,
    })),
  ];

  regenerateAlerts(state);

  const portfolio = buildPortfolioPayload(state);
  const insuredCount = portfolio.buyers.filter((buyer) => buyer.isInsured).length;

  return {
    ingestion: {
      loaded: prepared.length,
      skipped: rows.length - prepared.length,
      insuredCount,
      insuredPct: portfolio.summary.pctBuyersInsured,
      totalExposure: portfolio.summary.totalExposure,
    },
    portfolio,
  };
}
