"use client";

import { useState } from "react";
import Link from "next/link";
import type { AlertRow } from "@/lib/portfolio";
import { ALERT_META, type AlertType } from "@/lib/risk/alerts";
import { formatMoney } from "@/lib/format";
import { BandBadge, Button, Pill } from "@/components/ui";

const TONES: Record<AlertType, { pill: "teal" | "amber" | "rose"; dot: string }> = {
  upsell: { pill: "teal", dot: "bg-brandteal" },
  deterioration: { pill: "amber", dot: "bg-brandamber" },
  concentration: { pill: "rose", dot: "bg-rose-500" },
};

/** Improvement 2 — one action vocabulary across the whole app. */
function actionFor(alert: AlertRow): { label: string; variant: "teal" | "amber" } {
  if (alert.isInsured) return { label: "Review Limit", variant: "amber" };
  if (alert.type === "concentration") return { label: "Quote Cover", variant: "teal" };
  if (alert.type === "upsell") return { label: "Add to Policy", variant: "teal" };
  return { label: "Get Instant Assessment", variant: "teal" };
}

export function AlertsList({
  alerts,
  resolvedAlerts,
  onOpenBuyer,
  onResolve,
  compact = false,
}: {
  alerts: AlertRow[];
  resolvedAlerts: AlertRow[];
  onOpenBuyer: (buyerId: number) => void;
  onResolve: (alert: AlertRow) => void;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | AlertType>("all");
  const [limit, setLimit] = useState(compact ? 6 : 12);
  const [showResolved, setShowResolved] = useState(false);

  const filtered = alerts.filter((alert) => filter === "all" || alert.type === filter);
  const visible = filtered.slice(0, limit);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
        {(["all", "concentration", "deterioration", "upsell"] as const).map((option) => {
          const count =
            option === "all"
              ? alerts.length
              : alerts.filter((alert) => alert.type === option).length;
          const label =
            option === "all"
              ? "All alerts"
              : option === "concentration"
                ? "Concentration"
                : option === "deterioration"
                  ? "Deterioration"
                  : "Upsell";
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
                filter === option
                  ? "bg-navy-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}

        {resolvedAlerts.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowResolved((current) => !current)}
            className={`ml-1 rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
              showResolved
                ? "bg-slate-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {showResolved ? "Hide" : "View"} resolved ({resolvedAlerts.length})
          </button>
        ) : null}

        {compact ? (
          <Link
            href="/alerts"
            className="ml-auto text-[12px] font-semibold text-navy-700 hover:text-navy-900"
          >
            View all →
          </Link>
        ) : null}
      </div>

      <ul className="divide-y divide-slate-100">
        {visible.map((alert) => {
          const meta = ALERT_META[alert.type];
          const tone = TONES[alert.type];
          const action = actionFor(alert);
          return (
            <li key={alert.id} className="flex gap-3 px-5 py-3.5 transition hover:bg-slate-50/70">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-navy-900">
                    {alert.buyerName}
                  </span>
                  <Pill tone={tone.pill}>{meta.label}</Pill>
                  <BandBadge band={alert.riskBand} score={alert.riskScore} />
                  {alert.isInsured ? null : (
                    <span className="text-[11px] font-medium text-blue-600">uninsured</span>
                  )}
                  <span className="numeric ml-auto text-[11.5px] text-slate-500">
                    {formatMoney(alert.buyerExposure, { compact: true })} outstanding ·{" "}
                    {alert.country}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{alert.message}</p>
                <div className="no-print mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={action.variant}
                    onClick={() => onOpenBuyer(alert.buyerId)}
                  >
                    {action.label}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onResolve(alert)}
                    title="Mark this alert as dealt with"
                  >
                    <span aria-hidden className="text-emerald-600">
                      ✓
                    </span>
                    Resolve
                  </Button>
                  <span className="text-[11px] text-slate-400">{meta.blurb}</span>
                </div>
              </div>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="px-5 py-10 text-center text-[13px] text-slate-400">
            No alerts of this type. Try simulating the next month.
          </li>
        ) : null}
      </ul>

      {filtered.length > visible.length ? (
        <div className="no-print border-t border-slate-200 px-5 py-3 text-center">
          <Button size="sm" onClick={() => setLimit((current) => current + 12)}>
            Show more ({filtered.length - visible.length} remaining)
          </Button>
        </div>
      ) : null}

      {/* ---- Resolved archive (Improvement 6) ---- */}
      {showResolved && resolvedAlerts.length > 0 ? (
        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2 px-5 py-2.5">
            <span className="label-xs">Resolved &amp; archived</span>
            <span className="text-[11px] text-slate-400">
              kept as a record of what has been actioned
            </span>
          </div>
          <ul className="divide-y divide-slate-200/70">
            {resolvedAlerts.slice(0, 20).map((alert) => {
              const meta = ALERT_META[alert.type];
              return (
                <li key={alert.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  <span className="text-[12.5px] font-medium text-slate-500">
                    {alert.buyerName}
                  </span>
                  <Pill tone="slate">{meta.label}</Pill>
                  <span className="text-[11.5px] text-slate-500">{alert.message}</span>
                  <span className="numeric ml-auto shrink-0 text-[11px] text-slate-400">
                    resolved{" "}
                    {alert.resolvedAt
                      ? new Date(alert.resolvedAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
