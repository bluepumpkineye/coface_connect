"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioSummary } from "@/lib/portfolio";
import { monthLabel } from "@/lib/format";

const INSURED = "#e11d48";
const UNINSURED = "#2563eb";

/* ==========================================================================
   Tooltip primitive — dark navy, white text, shared border radius + shadow so
   every chart reads the same (Improvement 4).
   ========================================================================== */
function ChartTooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="min-w-[190px] rounded-xl bg-navy-900/97 px-3.5 py-3 text-white shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur">
      <p className="text-[12.5px] font-semibold leading-tight">{title}</p>
      <div className="mt-2 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-navy-100">
              {row.color ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              {row.label}
            </span>
            <span className="numeric font-semibold text-white">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   Risk distribution — buyer count per band, split by insured status.
 *
 * Hand-rolled rather than Recharts on purpose: every segment needs to be an
 * individually clickable, individually tooled element (Improvements 4 + 5), and
 * with only 4 bands x 2 segments an SVG-free DOM chart makes that trivial and
 * completely predictable.
   ========================================================================== */
export function RiskHistogram({
  summary,
  onSelect,
  activeSelection,
}: {
  summary: PortfolioSummary;
  onSelect: (band: string, segment: "insured" | "uninsured") => void;
  activeSelection: string | null;
}) {
  const [hover, setHover] = useState<{ band: string; segment: "insured" | "uninsured" } | null>(
    null,
  );
  const max = Math.max(
    1,
    ...summary.bandCounts.map((entry) => Math.max(entry.insured, entry.uninsured)),
  );

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="mb-3 flex items-center gap-4 text-[11px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INSURED }} />
          Insured
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: UNINSURED }} />
          Uninsured
        </span>
        <span className="ml-auto text-slate-400">Click a bar to filter the ledger</span>
      </div>

      <div className="flex items-end gap-3 sm:gap-6">
        {summary.bandCounts.map((entry) => {
          const bandTotal = entry.insured + entry.uninsured;
          const bandActive = activeSelection?.startsWith(`${entry.band}:`);
          return (
            <div key={entry.band} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-[170px] w-full items-end justify-center gap-1.5 sm:gap-2">
                {(
                  [
                    { segment: "insured", count: entry.insured, color: INSURED },
                    { segment: "uninsured", count: entry.uninsured, color: UNINSURED },
                  ] as const
                ).map((bar) => {
                  const key = `${entry.band}:${bar.segment}`;
                  const isActive = activeSelection === key;
                  const isHovered =
                    hover?.band === entry.band && hover?.segment === bar.segment;
                  const heightPct = (bar.count / max) * 100;
                  return (
                    <button
                      key={bar.segment}
                      type="button"
                      onClick={() => onSelect(entry.band, bar.segment)}
                      onMouseEnter={() => setHover({ band: entry.band, segment: bar.segment })}
                      onMouseLeave={() => setHover(null)}
                      title={`${bar.segment === "insured" ? "Insured" : "Uninsured"} · ${entry.band} risk · ${bar.count} buyers`}
                      className="group relative flex h-full w-full max-w-[46px] cursor-pointer flex-col justify-end"
                      aria-label={`Filter ledger to ${entry.band} risk, ${bar.segment}`}
                    >
                      {isHovered || isActive ? (
                        <span
                          className="absolute -top-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-navy-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl ring-1 ring-inset ring-white/10"
                          style={{ pointerEvents: "none" }}
                        >
                          <span
                            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ backgroundColor: bar.color }}
                          />
                          {bar.count} buyer{bar.count === 1 ? "" : "s"}
                          <span className="ml-1.5 font-normal text-navy-100">
                            {bar.segment === "insured" ? "insured" : "uninsured"}
                          </span>
                        </span>
                      ) : null}
                      <span
                        className="w-full rounded-t-[4px] transition-all duration-300"
                        style={{
                          height: `${Math.max(heightPct, bar.count > 0 ? 3 : 0)}%`,
                          backgroundColor: bar.color,
                          opacity: isActive ? 1 : isHovered ? 0.88 : 0.78,
                          boxShadow: isActive ? `0 0 0 2px ${bar.color}55` : undefined,
                          transform: isHovered || isActive ? "scaleY(1.02)" : "none",
                          transformOrigin: "bottom",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              <div
                className={`w-full border-t pt-1.5 text-center text-[11px] font-semibold transition ${
                  bandActive ? "border-navy-700 text-navy-900" : "border-slate-200 text-slate-500"
                }`}
              >
                {entry.band}
              </div>
              <div className="numeric text-[10.5px] text-slate-400">{bandTotal} total</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   Monitored risk trend (Recharts line chart)
   ========================================================================== */
type TrendTooltipProps = {
  active?: boolean;
  payload?: { payload: { month: string; "Insured book": number; "Uninsured book": number } }[];
};

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltip
      title={point.month}
      rows={[
        {
          label: "Insured book avg",
          value: `${point["Insured book"]}/100`,
          color: INSURED,
        },
        {
          label: "Uninsured book avg",
          value: `${point["Uninsured book"]}/100`,
          color: UNINSURED,
        },
      ]}
    />
  );
}

export function RiskTrendChart({ history }: { history: PortfolioSummary["history"] }) {
  const data = history.map((point) => ({
    month: monthLabel(point.date),
    "Insured book": point.insuredAvg,
    "Uninsured book": point.uninsuredAvg,
  }));

  return (
    <div className="h-[268px] w-full px-1 pb-1 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 18, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
          <Line
            type="monotone"
            dataKey="Insured book"
            stroke={INSURED}
            strokeWidth={2.2}
            dot={{ r: 3, strokeWidth: 0, fill: INSURED }}
            activeDot={{ r: 5 }}
            isAnimationActive
            animationDuration={500}
          />
          <Line
            type="monotone"
            dataKey="Uninsured book"
            stroke={UNINSURED}
            strokeWidth={2.2}
            dot={{ r: 3, strokeWidth: 0, fill: UNINSURED }}
            activeDot={{ r: 5 }}
            isAnimationActive
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-5 pt-1 text-[11px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: INSURED }} />
          Insured book
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: UNINSURED }} />
          Uninsured book
        </span>
      </div>
    </div>
  );
}
