"use client";

import { useEffect, useRef, useState } from "react";
import type { PortfolioSummary } from "@/lib/portfolio";
import { BAND_ON_DARK, formatMoney, formatPct } from "@/lib/format";

/** Smoothly animates between numeric values so mutations feel live. */
function useCountUp(value: number, duration = 480): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  return display;
}

function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const display = useCountUp(value);
  return <span className={className}>{formatMoney(display, { compact: true })}</span>;
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const display = useCountUp(value);
  return <span className={className}>{Math.round(display)}</span>;
}

function AnimatedPct({ value, className }: { value: number; className?: string }) {
  const display = useCountUp(value);
  return <span className={className}>{formatPct(display, 0)}</span>;
}

export type DrillDownKey =
  | "insured"
  | "missedOpportunity"
  | "uninsuredHighRisk"
  | "alerts";

function Tile({
  label,
  value,
  sub,
  accent,
  onClick,
  active,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  onClick?: () => void;
  active?: boolean;
  hint?: string;
}) {
  const clickable = Boolean(onClick);
  const Wrapper = clickable ? "button" : "div";
  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={onClick}
      title={hint}
      className={`surface col-span-12 flex flex-col gap-1 px-5 py-4 text-left sm:col-span-6 lg:col-span-2 ${
        clickable ? "tile-clickable" : ""
      } ${active ? "tile-active" : ""}`}
    >
      <span className="flex items-center gap-1">
        <span className="label-xs">{label}</span>
        {clickable ? (
          <span className="text-[9px] font-bold text-navy-500 opacity-0 transition group-hover:opacity-100">
            ↳
          </span>
        ) : null}
      </span>
      <span className={`numeric text-2xl font-semibold tracking-tight ${accent ?? "text-navy-900"}`}>
        {value}
      </span>
      {sub ? <span className="text-[11.5px] leading-snug text-slate-500">{sub}</span> : null}
    </Wrapper>
  );
}

export function SummaryCards({
  summary,
  onDrillDown,
  activeDrillDown,
}: {
  summary: PortfolioSummary;
  onDrillDown: (key: DrillDownKey) => void;
  activeDrillDown: DrillDownKey | null;
}) {
  const insuredOnDark = BAND_ON_DARK[summary.bandInsured] ?? BAND_ON_DARK.Low;
  const uninsuredOnDark = BAND_ON_DARK[summary.bandUninsured] ?? BAND_ON_DARK.Low;
  const animatedInsured = useCountUp(summary.avgRiskInsured);
  const animatedUninsured = useCountUp(summary.avgRiskUninsured);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ---- Headline: the adverse selection "aha" stat ---- */}
      <div className="surface-navy relative col-span-12 overflow-hidden px-6 py-5 shadow-sm">
        <div className="grid-texture pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brandamber" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-100">
              Adverse selection in this ledger
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-100">
                Insured book — average risk
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="numeric text-4xl font-semibold tracking-tight text-rose-300">
                  {Math.round(animatedInsured)}
                </span>
                <span className="text-sm font-medium text-navy-100">/ 100</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: insuredOnDark.bg, color: insuredOnDark.text }}
                >
                  {summary.bandInsured}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-navy-100">
                {summary.insuredBuyers} buyers ·{" "}
                {formatMoney(summary.insuredExposure, { compact: true })} exposure
              </div>
            </div>

            <div className="pb-2 text-[13px] font-semibold text-navy-100">vs</div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-100">
                Uninsured book — average risk
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="numeric text-4xl font-semibold tracking-tight text-sky-300">
                  {Math.round(animatedUninsured)}
                </span>
                <span className="text-sm font-medium text-navy-100">/ 100</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: uninsuredOnDark.bg, color: uninsuredOnDark.text }}
                >
                  {summary.bandUninsured}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-navy-100">
                {summary.uninsuredBuyers} buyers ·{" "}
                {formatMoney(summary.uninsuredExposure, { compact: true })} exposure
              </div>
            </div>

            <div className="ml-auto max-w-sm rounded-lg bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/15">
              <p className="text-[12.5px] font-medium leading-relaxed text-white">
                The insured book scores{" "}
                <strong className="font-bold text-brandamber">
                  +{summary.adverseSelectionGap} points
                </strong>{" "}
                riskier than the book left uninsured. Meanwhile{" "}
                <strong className="font-bold text-white">
                  {formatMoney(summary.missedOpportunityExposure, { compact: true })}
                </strong>{" "}
                of low/medium-risk receivables carries no cover at all.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tile label="Total buyers" value={String(summary.totalBuyers)} sub={`${formatMoney(summary.totalExposure, { compact: true })} outstanding across the ledger`} />

      <Tile
        label="Buyers insured"
        value={<AnimatedPct value={summary.pctBuyersInsured} />}
        sub={`${summary.insuredBuyers} of ${summary.totalBuyers} buyers on the programme`}
        accent="text-navy-700"
        onClick={() => onDrillDown("insured")}
        active={activeDrillDown === "insured"}
        hint="Click to filter the ledger to insured buyers"
      />
      <Tile
        label="Exposure insured"
        value={<AnimatedPct value={summary.pctExposureInsured} />}
        sub={`${formatMoney(summary.insuredExposure, { compact: true })} of ${formatMoney(summary.totalExposure, { compact: true })}`}
        accent="text-navy-700"
      />
      <Tile
        label="Uninsured, low/medium risk"
        value={<AnimatedMoney value={summary.missedOpportunityExposure} />}
        sub={`${summary.missedOpportunityCount} buyers — the missed opportunity`}
        accent="text-teal-700"
        onClick={() => onDrillDown("missedOpportunity")}
        active={activeDrillDown === "missedOpportunity"}
        hint="Click to filter the ledger to uninsured low/medium-risk buyers"
      />
      <Tile
        label="Uninsured, high/critical risk"
        value={<AnimatedMoney value={summary.uninsuredHighRiskExposure} />}
        sub={`${summary.uninsuredHighRiskCount} buyers with no safety net`}
        accent="text-rose-700"
        onClick={() => onDrillDown("uninsuredHighRisk")}
        active={activeDrillDown === "uninsuredHighRisk"}
        hint="Click to filter the ledger to uninsured high/critical-risk buyers"
      />
      <Tile
        label="Open alerts"
        value={
          <AnimatedNumber
            value={
              summary.alertCounts.upsell +
              summary.alertCounts.deterioration +
              summary.alertCounts.concentration
            }
          />
        }
        sub={`${summary.alertCounts.upsell} upsell · ${summary.alertCounts.deterioration} deterioration · ${summary.alertCounts.concentration} concentration`}
        accent="text-amber-700"
      />
    </div>
  );
}
