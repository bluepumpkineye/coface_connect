"use client";

import { useCallback, useState } from "react";
import { useStore } from "@/components/AppStore";
import type { AlertRow } from "@/lib/portfolio";
import type { ClientBuyer } from "@/lib/types";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { AssessmentModal } from "@/components/dashboard/AssessmentModal";
import { Button, Card, CardHeader, EmptyChartState, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export function AlertsView() {
  const { data, loading, working, simulateMonth, loadDemoData, resolveAlert, pushToast } = useStore();
  const [assessing, setAssessing] = useState<ClientBuyer | null>(null);

  const openBuyerById = useCallback(
    (buyerId: number) => {
      const buyer = data?.buyers.find((row) => row.id === buyerId);
      if (buyer) setAssessing(buyer);
    },
    [data],
  );

  const handleResolve = useCallback(
    async (alert: AlertRow) => {
      const ok = await resolveAlert(alert.id);
      if (ok) {
        pushToast(`Alert resolved and archived — ${alert.buyerName} (${alert.type}).`, "success");
      }
    },
    [resolveAlert, pushToast],
  );

  if (loading && !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center gap-3 text-[13px] text-slate-500">
        <Spinner className="h-5 w-5 text-navy-700" />
        Loading alerts…
      </div>
    );
  }

  if (!data || data.summary.totalBuyers === 0) {
    return (
      <Card>
        <CardHeader title="Early warning & upsell alerts" />
        <div className="px-5 py-6">
          <EmptyChartState message="No portfolio loaded yet — generate demo data to populate alerts." />
          <div className="mt-4 flex justify-center">
            <Button variant="teal" onClick={() => void loadDemoData()}>
              Load Demo Data
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const { summary, alerts, resolvedAlerts } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-navy-900">
            Early warning &amp; upsell alerts
          </h1>
          <p className="max-w-3xl text-[12.5px] text-slate-500">
            Deterministic, rule-based signals recomputed every time the ledger changes. No black
            boxes — every rule and threshold is visible below.
          </p>
        </div>
        <div className="ml-auto">
          <Button variant="secondary" onClick={() => void simulateMonth()} disabled={!!working}>
            {working === "simulate" ? <Spinner className="h-3.5 w-3.5" /> : <span aria-hidden>⏭</span>}
            Simulate Next Month
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          {
            title: "Concentration",
            count: summary.alertCounts.concentration,
            tone: "border-rose-200 bg-rose-50/60",
            rule: "Uninsured buyer > 10% of total uninsured exposure",
            detail: `Threshold ${formatMoney(summary.thresholds.concentrationThreshold)} of ${formatMoney(summary.thresholds.totalUninsuredExposure)} uninsured`,
          },
          {
            title: "Deterioration",
            count: summary.alertCounts.deterioration,
            tone: "border-amber-200 bg-amber-50/60",
            rule: "Payment trend = worsening AND risk band Medium or above",
            detail: "Catches names sliding before they become a claim",
          },
          {
            title: "Upsell opportunity",
            count: summary.alertCounts.upsell,
            tone: "border-teal-200 bg-teal-50/60",
            rule: "Uninsured, Low/Medium band, exposure in top 30% of the book",
            detail: `Exposure cutoff ${formatMoney(summary.thresholds.topExposureCutoff)}`,
          },
        ].map((card) => (
          <div key={card.title} className={`rounded-xl border px-5 py-4 ${card.tone}`}>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold text-navy-900">{card.title}</p>
              <span className="numeric text-2xl font-semibold text-navy-900">{card.count}</span>
            </div>
            <p className="mt-2 text-[11.5px] font-medium text-slate-700">{card.rule}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{card.detail}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Alert queue"
          subtitle={`${alerts.length} open, ${resolvedAlerts.length} resolved — prioritised concentration → deterioration → upsell. Actioning a buyer auto-resolves their alerts.`}
        />
        <AlertsList
          alerts={alerts}
          resolvedAlerts={resolvedAlerts}
          onOpenBuyer={openBuyerById}
          onResolve={handleResolve}
        />
      </Card>

      {assessing ? <AssessmentModal buyer={assessing} onClose={() => setAssessing(null)} /> : null}
    </div>
  );
}
