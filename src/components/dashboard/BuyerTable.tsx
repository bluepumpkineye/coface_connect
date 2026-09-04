"use client";

import { Fragment, useMemo, useState } from "react";
import type { ClientBuyer, LedgerFilter } from "@/lib/types";
import { LEDGER_DEFAULT_FILTER, policyActionFor } from "@/lib/types";
import type { RiskBand } from "@/lib/risk/scoring";
import { BAND_COLORS, formatMoney, trendArrow } from "@/lib/format";
import { BandBadge, Button, Pill } from "@/components/ui";
import { RISK_WEIGHTS } from "@/lib/risk/scoring";

type SortKey =
  | "name"
  | "country"
  | "industry"
  | "outstandingAmount"
  | "riskScore"
  | "avgDaysLate";

const COLUMNS: { key: SortKey; label: string; align?: string }[] = [
  { key: "name", label: "Buyer" },
  { key: "country", label: "Country" },
  { key: "industry", label: "Industry" },
  { key: "outstandingAmount", label: "Outstanding", align: "text-right" },
  { key: "avgDaysLate", label: "Days late", align: "text-right" },
  { key: "riskScore", label: "Risk", align: "text-right" },
];

const ALL_BANDS: RiskBand[] = ["Low", "Medium", "High", "Critical"];

export function BuyerTable({
  buyers,
  filter,
  onFilterChange,
  onAssess,
}: {
  buyers: ClientBuyer[];
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
  onAssess: (buyer: ClientBuyer) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("outstandingAmount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(20);
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = buyers.filter((buyer) => {
      if (filter.insured === "insured" && !buyer.isInsured) return false;
      if (filter.insured === "uninsured" && buyer.isInsured) return false;
      if (filter.bands.length > 0 && !filter.bands.includes(buyer.riskBand as RiskBand)) {
        return false;
      }
      if (!needle) return true;
      return (
        buyer.name.toLowerCase().includes(needle) ||
        buyer.country.toLowerCase().includes(needle) ||
        buyer.industry.toLowerCase().includes(needle)
      );
    });

    return filtered.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name" || sortKey === "country" || sortKey === "industry") {
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * direction;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * direction;
    });
  }, [buyers, query, filter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "country" || key === "industry" ? "asc" : "desc");
    }
  };

  const visible = rows.slice(0, limit);
  const totalExposure = rows.reduce((sum, buyer) => sum + buyer.outstandingAmount, 0);
  const drillDownActive = filter.label !== null || filter.insured !== "all" || filter.bands.length > 0;

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search buyer, country or industry…"
          className="h-9 w-60 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-navy-900 outline-none placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
        />
        <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-300">
          {(["all", "insured", "uninsured"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onFilterChange({ ...filter, insured: option, label: null })}
              className={`px-3 py-1.5 text-[12px] font-semibold capitalize transition ${
                filter.insured === option
                  ? "bg-navy-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <select
          value={filter.bands.length === 1 ? filter.bands[0] : "all"}
          onChange={(event) => {
            const value = event.target.value;
            onFilterChange({
              ...filter,
              bands: value === "all" ? [] : [value as RiskBand],
              label: null,
            });
          }}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-navy-500"
        >
          <option value="all">All risk bands</option>
          {ALL_BANDS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[11.5px] text-slate-500">
          <strong className="numeric font-semibold text-navy-900">{rows.length}</strong> buyers ·{" "}
          {formatMoney(totalExposure, { compact: true })} exposure
        </span>
      </div>

      {/* ---- Active drill-down filter chip (Improvement 5) ---- */}
      {drillDownActive ? (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50/70 px-5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Filtered
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-navy-900 ring-1 ring-inset ring-amber-300">
            {filter.label ??
              [
                filter.insured === "all" ? null : filter.insured,
                filter.bands.length > 0 ? `${filter.bands.join(" / ")} risk` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            <button
              type="button"
              onClick={() => onFilterChange(LEDGER_DEFAULT_FILTER)}
              className="ml-0.5 rounded-full px-1 text-[13px] leading-none text-slate-400 transition hover:text-rose-600"
              aria-label="Clear filter"
            >
              ✕
            </button>
          </span>
          <button
            type="button"
            onClick={() => onFilterChange(LEDGER_DEFAULT_FILTER)}
            className="text-[11.5px] font-semibold text-navy-700 underline decoration-dotted hover:text-navy-900"
          >
            Reset to all buyers
          </button>
        </div>
      ) : null}

      <div className="thin-scroll max-h-[620px] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr className="border-b border-slate-200">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={() => toggleSort(column.key)}
                  className={`cursor-pointer select-none px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500 hover:text-navy-800 ${column.align ?? ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    <span
                      className={`text-[9px] ${sortKey === column.key ? "text-navy-800" : "text-slate-300"}`}
                    >
                      {sortKey === column.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </span>
                </th>
              ))}
              <th className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Band
              </th>
              <th className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Trend
              </th>
              <th className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Cover
              </th>
              <th className="no-print px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((buyer) => {
              const colors = BAND_COLORS[buyer.riskBand] ?? BAND_COLORS.Low;
              const trend = trendArrow(buyer.paymentTrend);
              const isOpen = expanded === buyer.id;
              const action = policyActionFor(buyer.isInsured);
              return (
                <Fragment key={buyer.id}>
                  <tr className="group border-b border-slate-100 transition hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : buyer.id)}
                        className="flex items-center gap-2 text-left"
                      >
                        <span
                          className={`text-[9px] text-slate-400 transition ${isOpen ? "rotate-90" : ""}`}
                        >
                          ▶
                        </span>
                        <span>
                          <span className="block text-[13px] font-semibold text-navy-900">
                            {buyer.name}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            Buyer since {buyer.buyerSince}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-600">{buyer.country}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-600">{buyer.industry}</td>
                    <td className="numeric px-4 py-2.5 text-right text-[12.5px] font-semibold text-navy-900">
                      {formatMoney(buyer.outstandingAmount)}
                    </td>
                    <td className="numeric px-4 py-2.5 text-right text-[12.5px] text-slate-600">
                      {buyer.avgDaysLate}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${buyer.riskScore}%`, backgroundColor: colors.hex }}
                          />
                        </div>
                        <span className="numeric w-6 text-right text-[12.5px] font-semibold text-navy-900">
                          {buyer.riskScore}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <BandBadge band={buyer.riskBand} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[13px] font-bold ${trend.className}`}
                        title={trend.label}
                      >
                        {trend.icon}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {buyer.isInsured ? (
                        <Pill tone="rose">Insured</Pill>
                      ) : (
                        <Pill tone="navy">Uninsured</Pill>
                      )}
                    </td>
                    <td className="no-print px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant={action.variant}
                        onClick={() => onAssess(buyer)}
                      >
                        {action.label}
                      </Button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <td colSpan={10} className="px-5 py-4">
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
                          <div>
                            <p className="label-xs mb-2">
                              Why this score — weighted sub-scores (illustrative model)
                            </p>
                            <div className="space-y-2">
                              {(
                                [
                                  [
                                    "Payment behaviour",
                                    buyer.scoreBreakdown?.payment,
                                    RISK_WEIGHTS.payment,
                                    `${buyer.avgDaysLate} days late · ${buyer.paymentTrend}`,
                                  ],
                                  [
                                    "Country risk",
                                    buyer.scoreBreakdown?.country,
                                    RISK_WEIGHTS.country,
                                    buyer.country,
                                  ],
                                  [
                                    "Industry risk",
                                    buyer.scoreBreakdown?.industry,
                                    RISK_WEIGHTS.industry,
                                    buyer.industry,
                                  ],
                                  [
                                    "Concentration",
                                    buyer.scoreBreakdown?.concentration,
                                    RISK_WEIGHTS.concentration,
                                    `${((buyer.scoreBreakdown?.exposureShare ?? 0) * 100).toFixed(1)}% of portfolio exposure`,
                                  ],
                                ] as [string, number | undefined, number, string][]
                              ).map(([label, value, weight, detail]) => {
                                const numeric = value ?? 0;
                                return (
                                  <div key={label} className="flex items-center gap-3">
                                    <span className="w-36 text-[12px] font-medium text-slate-600">
                                      {label}
                                      <span className="ml-1 text-[10px] text-slate-400">
                                        {Math.round(weight * 100)}%
                                      </span>
                                    </span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
                                      <div
                                        className="h-full rounded-full bg-navy-700"
                                        style={{ width: `${numeric}%` }}
                                      />
                                    </div>
                                    <span className="numeric w-8 text-right text-[12px] font-semibold text-navy-900">
                                      {numeric}
                                    </span>
                                    <span className="w-56 text-[11px] text-slate-500">
                                      {detail}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="rounded-lg bg-white p-4 ring-1 ring-inset ring-slate-200">
                            <p className="label-xs mb-2">Ledger detail</p>
                            <dl className="space-y-1.5 text-[12px]">
                              {[
                                ["Outstanding", formatMoney(buyer.outstandingAmount)],
                                ["Credit limit used", formatMoney(buyer.creditLimitUsed)],
                                ["Limit requested", formatMoney(buyer.creditLimitRequested)],
                                [
                                  "Portfolio share",
                                  `${((buyer.scoreBreakdown?.exposureShare ?? 0) * 100).toFixed(2)}%`,
                                ],
                              ].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-4">
                                  <dt className="text-slate-500">{label}</dt>
                                  <dd className="numeric font-semibold text-navy-900">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-center text-[13px] text-slate-400">
                  No buyers match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {rows.length > visible.length ? (
        <div className="no-print border-t border-slate-200 px-5 py-3 text-center">
          <Button size="sm" onClick={() => setLimit((current) => current + 25)}>
            Show 25 more ({rows.length - visible.length} remaining)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
