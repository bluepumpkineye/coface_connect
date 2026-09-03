"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssessmentPayload, ClientBuyer } from "@/lib/types";
import { BAND_COLORS, formatMoney, formatPct } from "@/lib/format";
import { Button, Spinner } from "@/components/ui";
import { useStore } from "@/components/AppStore";

const STAGES = [
  "Pulling ledger exposure…",
  "Screening payment behaviour…",
  "Applying country & sector indices…",
  "Calculating concentration…",
  "Building indicative terms…",
];

/**
 * Improvement 2 — ONE modal, two modes.
 *
 *   uninsured  -> "Instant Coverage Recommendation", primary action "Add to Policy"
 *   insured    -> "Re-assessment", current vs suggested limit, primary action
 *                 "Update Policy Limit"
 *
 * Both modes share the score-breakdown panel and both fire the same live
 * mutation path (Improvement 1).
 */
export function AssessmentModal({
  buyer,
  onClose,
}: {
  buyer: ClientBuyer;
  onClose: () => void;
}) {
  const { insureBuyer, updateBuyerLimit, pushToast } = useStore();
  const [phase, setPhase] = useState<"loading" | "done" | "error">("loading");
  const [stage, setStage] = useState(0);
  const [payload, setPayload] = useState<AssessmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isReassessment = buyer.isInsured;

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 300);

    async function run() {
      try {
        const response = await fetch("/api/assessment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buyerId: buyer.id }),
        });
        const text = await response.text();
        const json = JSON.parse(text) as AssessmentPayload & { error?: string };
        if (!response.ok) throw new Error(json.error ?? "Assessment failed");
        if (cancelled) return;
        setPayload(json);
        setPhase("done");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Assessment failed");
        setPhase("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [buyer.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const limitDelta = useMemo(() => {
    if (!payload) return { direction: "flat" as const, delta: 0, pctChange: 0 };
    const delta = payload.assessment.suggestedCreditLimit - payload.assessment.currentLimit;
    return {
      direction: delta > 0 ? ("up" as const) : delta < 0 ? ("down" as const) : ("flat" as const),
      delta,
      pctChange:
        payload.assessment.currentLimit > 0
          ? (delta / payload.assessment.currentLimit) * 100
          : 0,
    };
  }, [payload]);

  const colors = BAND_COLORS[buyer.riskBand] ?? BAND_COLORS.Low;

  const commit = async () => {
    if (!payload || saving) return;
    setSaving(true);
    try {
      if (isReassessment) {
        const suggested = payload.assessment.suggestedCreditLimit;
        const outcome = await updateBuyerLimit(buyer.id, suggested);
        if (outcome.ok) {
          pushToast(
            `${buyer.name} limit updated: ${formatMoney(payload.assessment.currentLimit, { compact: true })} → ${formatMoney(suggested, { compact: true })}.` +
              (outcome.autoResolved > 0 ? ` ${outcome.autoResolved} related alert${outcome.autoResolved === 1 ? "" : "s"} cleared.` : ""),
            "success",
          );
        }
      } else {
        const outcome = await insureBuyer(buyer.id, true);
        if (outcome.ok) {
          pushToast(
            `${buyer.name} added to policy. Insured exposure +${formatMoney(buyer.outstandingAmount, { compact: true })}.` +
              (outcome.autoResolved > 0 ? ` ${outcome.autoResolved} related alert${outcome.autoResolved === 1 ? "" : "s"} cleared.` : ""),
            "success",
          );
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[2px]"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header
          className={`flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 text-white ${
            isReassessment ? "bg-navy-800" : "bg-navy-900"
          }`}
        >
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-navy-100/80">
              {isReassessment ? "Re-assessment" : "Instant coverage recommendation"}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{buyer.name}</h2>
            <p className="text-[12px] text-navy-100/80">
              {buyer.country} · {buyer.industry} · outstanding{" "}
              {formatMoney(buyer.outstandingAmount)}
              {isReassessment ? (
                <span className="ml-1.5 rounded bg-white/15 px-1.5 py-0.5 text-[10.5px] font-semibold">
                  already on cover
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-navy-100/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {phase === "loading" ? (
          <div className="px-6 py-12">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <span
                  className="absolute inset-0 animate-ping rounded-full"
                  style={{ backgroundColor: "rgb(15 181 166 / 0.2)" }}
                />
                <span
                  className="relative flex h-11 w-11 items-center justify-center rounded-full text-white"
                  style={{
                    backgroundColor: isReassessment ? "#0d2340" : "#08172e",
                    animation: "pulse-ring 1.4s ease-out infinite",
                  }}
                >
                  <Spinner className="h-5 w-5" />
                </span>
              </div>
              <p className="text-[13px] font-semibold text-navy-900">
                {isReassessment ? "Re-assessing buyer risk…" : "Assessing buyer risk…"}
              </p>
              <div className="w-full space-y-1.5">
                {STAGES.map((label, index) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2 text-[11.5px] transition ${
                      index <= stage ? "text-navy-800" : "text-slate-300"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: index <= stage ? "#0fb5a6" : "#e2e8f0" }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] font-semibold text-rose-700">Assessment failed</p>
            <p className="mt-1 text-[12px] text-slate-500">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : null}

        {phase === "done" && payload ? (
          <div className="max-h-[72vh] overflow-auto">
            {isReassessment ? (
              /* ---- Re-assessment: current vs suggested limit ---- */
              <div className="px-6 py-5">
                <p className="label-xs mb-3">Credit limit — current vs suggested</p>
                <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Current limit
                    </p>
                    <p className="numeric mt-0.5 text-2xl font-semibold text-navy-900">
                      {formatMoney(payload.assessment.currentLimit, { compact: true })}
                    </p>
                  </div>
                  <span className="text-xl text-slate-300">→</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Suggested limit
                    </p>
                    <p
                      className={`numeric mt-0.5 text-2xl font-semibold ${
                        limitDelta.direction === "down"
                          ? "text-rose-700"
                          : limitDelta.direction === "up"
                            ? "text-emerald-700"
                            : "text-navy-900"
                      }`}
                    >
                      {formatMoney(payload.assessment.suggestedCreditLimit, { compact: true })}
                    </p>
                  </div>
                  <span
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1 ring-inset ${
                      limitDelta.direction === "down"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : limitDelta.direction === "up"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {limitDelta.direction === "down"
                      ? "▼"
                      : limitDelta.direction === "up"
                        ? "▲"
                        : "—"}
                    {formatMoney(Math.abs(limitDelta.delta), { compact: true })} (
                    {Math.abs(Math.round(limitDelta.pctChange))}%)
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                  {limitDelta.direction === "down"
                    ? "Recommended reduction — payment behaviour has deteriorated since the limit was set."
                    : limitDelta.direction === "up"
                      ? "Headroom available — this name is performing better than its current limit assumes."
                      : "Current limit remains appropriate for this risk band."}{" "}
                  Requested exposure is {formatMoney(payload.assessment.requestedExposure, { compact: true })}.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div
                    className="rounded-lg p-4 ring-1 ring-inset"
                    style={{ backgroundColor: `${colors.hex}0f` }}
                  >
                    <p className="label-xs">Risk band</p>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span
                        className="numeric text-3xl font-semibold"
                        style={{ color: colors.hex }}
                      >
                        {payload.assessment.riskScore}
                      </span>
                      <span className="text-[11px] text-slate-500">/ 100</span>
                    </div>
                    <p className="mt-1 text-[12px] font-semibold" style={{ color: colors.hex }}>
                      {payload.assessment.riskBand}
                    </p>
                  </div>
                  <div className="rounded-lg bg-teal-50 p-4 ring-1 ring-inset ring-teal-200">
                    <p className="label-xs">Indicative premium</p>
                    <p className="numeric mt-1.5 text-xl font-semibold text-teal-800">
                      {formatMoney(payload.assessment.premiumLow, { compact: true })}–
                      {formatMoney(payload.assessment.premiumHigh, { compact: true })}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {(payload.assessment.premiumRateLow * 100).toFixed(2)}%–
                      {(payload.assessment.premiumRateHigh * 100).toFixed(2)}% of limit
                    </p>
                  </div>
                  <div className="rounded-lg bg-navy-50 p-4 ring-1 ring-inset ring-navy-100">
                    <p className="label-xs">Utilisation</p>
                    <p className="numeric mt-1.5 text-xl font-semibold text-navy-900">
                      {formatPct(payload.assessment.limitUtilisation * 100, 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      of {formatMoney(payload.assessment.requestedExposure, { compact: true })}{" "}
                      requested
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* ---- New coverage recommendation ---- */
              <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-3">
                <div
                  className="rounded-lg p-4 ring-1 ring-inset"
                  style={{ backgroundColor: `${colors.hex}0f` }}
                >
                  <p className="label-xs">Risk band</p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className="numeric text-3xl font-semibold"
                      style={{ color: colors.hex }}
                    >
                      {payload.assessment.riskScore}
                    </span>
                    <span className="text-[11px] text-slate-500">/ 100</span>
                  </div>
                  <p className="mt-1 text-[12px] font-semibold" style={{ color: colors.hex }}>
                    {payload.assessment.riskBand}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-50 p-4 ring-1 ring-inset ring-navy-100">
                  <p className="label-xs">Suggested credit limit</p>
                  <p className="numeric mt-1.5 text-2xl font-semibold text-navy-900">
                    {formatMoney(payload.assessment.suggestedCreditLimit, { compact: true })}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatPct(payload.assessment.limitUtilisation * 100, 0)} of requested{" "}
                    {formatMoney(payload.assessment.requestedExposure, { compact: true })}
                  </p>
                </div>
                <div className="rounded-lg bg-teal-50 p-4 ring-1 ring-inset ring-teal-200">
                  <p className="label-xs">Indicative premium</p>
                  <p className="numeric mt-1.5 text-2xl font-semibold text-teal-800">
                    {formatMoney(payload.assessment.premiumLow, { compact: true })}–
                    {formatMoney(payload.assessment.premiumHigh, { compact: true })}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {(payload.assessment.premiumRateLow * 100).toFixed(2)}%–
                    {(payload.assessment.premiumRateHigh * 100).toFixed(2)}% of covered limit
                  </p>
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 px-6 py-5">
              <p className="label-xs mb-3">Score drivers — transparent, weighted sub-scores</p>
              <div className="space-y-2.5">
                {payload.assessment.drivers.map((driver) => (
                  <div key={driver.label} className="flex items-center gap-3">
                    <span className="w-36 text-[12.5px] font-medium text-slate-700">
                      {driver.label}
                      <span className="ml-1.5 text-[10px] text-slate-400">{driver.weight}</span>
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Number.parseInt(driver.value, 10)}%`,
                          backgroundColor: colors.hex,
                        }}
                      />
                    </div>
                    <span className="numeric w-9 text-right text-[12px] font-semibold text-navy-900">
                      {driver.value}
                    </span>
                    <span className="w-52 text-[11px] text-slate-500">{driver.detail}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                Illustrative only. Four weighted factors — payment behaviour (40%), country (20%),
                industry (20%), concentration (20%). Not Coface&apos;s CUBE engine and not a binding
                quotation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <Button
                variant={isReassessment ? "amber" : "teal"}
                onClick={() => void commit()}
                disabled={saving}
              >
                {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
                {saving
                  ? "Saving…"
                  : isReassessment
                    ? "Update Policy Limit"
                    : "Add to Policy"}
              </Button>
              <Button onClick={onClose} disabled={saving}>
                {isReassessment ? "Keep current limit" : "Not now"}
              </Button>
              <p className="ml-auto max-w-xs text-right text-[11px] leading-snug text-slate-500">
                Typical government trade credit agency turnaround:{" "}
                <strong className="font-semibold text-slate-700">2–4 weeks</strong>.
                <br />
                Coface Connect: <strong className="font-semibold text-brandteal">instant</strong>.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
