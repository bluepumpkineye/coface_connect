"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "@/components/AppStore";
import type { AlertRow } from "@/lib/portfolio";
import type { ClientBuyer, LedgerFilter } from "@/lib/types";
import { LEDGER_DEFAULT_FILTER } from "@/lib/types";
import type { RiskBand } from "@/lib/risk/scoring";
import { SummaryCards, type DrillDownKey } from "@/components/dashboard/SummaryCards";
import { CoverageGapMatrix } from "@/components/dashboard/CoverageGapMatrix";
import { RiskHistogram, RiskTrendChart } from "@/components/dashboard/Charts";
import { BuyerTable } from "@/components/dashboard/BuyerTable";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { AssessmentModal } from "@/components/dashboard/AssessmentModal";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ExportReport } from "@/components/dashboard/ExportReport";
import { Button, Card, CardHeader, EmptyChartState, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/format";

/** Maps a summary-card drill-down to a ledger filter. */
const DRILL_DOWNS: Record<DrillDownKey, LedgerFilter> = {
  insured: { insured: "insured", bands: [], label: "Insured buyers" },
  missedOpportunity: {
    insured: "uninsured",
    bands: ["Low", "Medium"],
    label: "Uninsured · Low/Medium risk",
  },
  uninsuredHighRisk: {
    insured: "uninsured",
    bands: ["High", "Critical"],
    label: "Uninsured · High/Critical risk",
  },
  alerts: LEDGER_DEFAULT_FILTER,
};

export function Dashboard() {
  const { data, loading, working, loadDemoData, resetData, simulateMonth, resolveAlert, pushToast } =
    useStore();
  const [assessing, setAssessing] = useState<ClientBuyer | null>(null);
  const [filter, setFilter] = useState<LedgerFilter>(LEDGER_DEFAULT_FILTER);
  const ledgerRef = useRef<HTMLDivElement>(null);

  /* ---- All hooks run before any early return --------------------------- */
  const buyers = useMemo(() => data?.buyers ?? [], [data]);
  const summary = data?.summary ?? null;
  const alerts = data?.alerts ?? [];
  const resolvedAlerts = data?.resolvedAlerts ?? [];

  /** Improvement 5 — apply a drill-down and bring the ledger into view. */
  const applyFilter = useCallback((next: LedgerFilter) => {
    setFilter(next);
    window.requestAnimationFrame(() => {
      ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleDrillDown = useCallback(
    (key: DrillDownKey) => {
      applyFilter(DRILL_DOWNS[key]);
    },
    [applyFilter],
  );

  const handleHistogramSelect = useCallback(
    (band: string, segment: "insured" | "uninsured") => {
      applyFilter({
        insured: segment,
        bands: [band as RiskBand],
        label: `${band} risk · ${segment === "insured" ? "Insured" : "Uninsured"}`,
      });
    },
    [applyFilter],
  );

  /** Improvement 5e — scatter dot opens the unified modal. */
  const openBuyerById = useCallback(
    (buyerId: number) => {
      const buyer = buyers.find((row) => row.id === buyerId);
      if (buyer) setAssessing(buyer);
    },
    [buyers],
  );

  /** Improvement 6 — resolve, with toast confirmation. */
  const handleResolve = useCallback(
    async (alert: AlertRow) => {
      const ok = await resolveAlert(alert.id);
      if (ok) {
        pushToast(`Alert resolved and archived — ${alert.buyerName} (${alert.type}).`, "success");
      }
    },
    [resolveAlert, pushToast],
  );

  const activeHistogramSelection = useMemo(() => {
    if (filter.bands.length !== 1 || filter.insured === "all") return null;
    return `${filter.bands[0]}:${filter.insured}`;
  }, [filter]);

  /**
   * An uploaded ledger only knows the client's name, so the country, sector and
   * policy reference are placeholders. Show only what is actually known rather
   * than a line of em dashes.
   */
  const policyholderMeta = useMemo(() => {
    const client = data?.policyholder;
    if (!client) return null;
    const parts = [client.country, client.industry].filter((part) => part && part !== "—");
    if (client.policyRef && client.policyRef !== "—") parts.push(`policy ${client.policyRef}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [data]);

  const activeDrillDown = useMemo<DrillDownKey | null>(() => {
    const entry = Object.entries(DRILL_DOWNS).find(
      ([, value]) => value.label !== null && value.label === filter.label,
    );
    return entry ? (entry[0] as DrillDownKey) : null;
  }, [filter]);

  /* ---- Early returns --------------------------------------------------- */
  if (loading && !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center gap-3 text-[13px] text-slate-500">
        <Spinner className="h-5 w-5 text-navy-700" />
        Loading portfolio…
      </div>
    );
  }

  if (!data || !summary || summary.totalBuyers === 0) {
    return (
      <>
        <EmptyState />
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => void resetData()}>
            Clear workspace
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-navy-900">
              {data.policyholder.name}
            </h1>
            <span className="rounded-full bg-navy-900/5 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-navy-700 ring-1 ring-inset ring-navy-900/10">
              Client
            </span>
          </div>
          {policyholderMeta ? (
            <p className="text-[12px] text-slate-500">{policyholderMeta}</p>
          ) : null}
          <p className="text-[12px] text-slate-500">
            Full receivables ledger · updated{" "}
            {new Date(summary.generatedAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void simulateMonth()} disabled={!!working}>
            {working === "simulate" ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <span aria-hidden>⏭</span>
            )}
            Simulate Next Month
          </Button>
          <Button variant="secondary" onClick={() => void loadDemoData()} disabled={!!working}>
            {working === "demo" ? <Spinner className="h-3.5 w-3.5" /> : <span aria-hidden>⟳</span>}
            Regenerate Demo Data
          </Button>
          <ExportReport data={data} />
        </div>
      </div>

      <SummaryCards
        summary={summary}
        onDrillDown={handleDrillDown}
        activeDrillDown={activeDrillDown}
      />

      <Card>
        <CardHeader
          title="Coverage Gap Matrix"
          subtitle="Risk score vs outstanding balance, sized by exposure. Insured names cluster high-risk; the large blue dots bottom-left are the missed opportunity. Click any dot for an instant assessment."
          action={
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="hidden items-center gap-1.5 lg:flex">
                <span className="h-2 w-2 rounded-sm bg-emerald-500/30 ring-1 ring-emerald-400" />
                Low
              </span>
              <span className="hidden items-center gap-1.5 lg:flex">
                <span className="h-2 w-2 rounded-sm bg-amber-500/30 ring-1 ring-amber-400" />
                Medium
              </span>
              <span className="hidden items-center gap-1.5 lg:flex">
                <span className="h-2 w-2 rounded-sm bg-orange-500/30 ring-1 ring-orange-400" />
                High
              </span>
              <span className="hidden items-center gap-1.5 lg:flex">
                <span className="h-2 w-2 rounded-sm bg-rose-500/30 ring-1 ring-rose-400" />
                Critical
              </span>
            </div>
          }
        />
        <CoverageGapMatrix
          buyers={buyers}
          totalExposure={summary.totalExposure}
          onSelect={openBuyerById}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Risk distribution by band"
            subtitle="Buyer count per band, split by insured status — click a bar to filter the ledger"
          />
          <RiskHistogram
            summary={summary}
            onSelect={handleHistogramSelect}
            activeSelection={activeHistogramSelection}
          />
        </Card>
        <Card>
          <CardHeader
            title="Monitored risk trend"
            subtitle="Average score by month — insured vs uninsured book"
          />
          {summary.history.length > 1 ? (
            <RiskTrendChart history={summary.history} />
          ) : (
            <EmptyChartState message="Only one month of history so far. Use “Simulate Next Month” to build a trend." />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Early warning & upsell alerts"
          subtitle={`${alerts.length} open · ${resolvedAlerts.length} resolved · thresholds: top-30% exposure ≥ ${formatMoney(summary.thresholds.topExposureCutoff, { compact: true })}, uninsured concentration > 10%`}
        />
        <AlertsList
          alerts={alerts}
          resolvedAlerts={resolvedAlerts}
          compact
          onOpenBuyer={openBuyerById}
          onResolve={handleResolve}
        />
      </Card>

      {/* key remounts the table on drill-down, resetting pagination + expansion */}
      <div ref={ledgerRef} className="scroll-mt-20">
        <Card>
          <CardHeader
            title={`Buyer ledger — ${data.policyholder.name}`}
            subtitle="Every buyer owing this client money. Click a buyer name to expand the score breakdown · click a card or chart above to filter"
          />
          <BuyerTable
            key={`${filter.insured}|${filter.bands.join(",")}|${filter.label ?? ""}`}
            buyers={buyers}
            filter={filter}
            onFilterChange={setFilter}
            onAssess={setAssessing}
          />
        </Card>
      </div>

      {assessing ? <AssessmentModal buyer={assessing} onClose={() => setAssessing(null)} /> : null}
    </div>
  );
}
