"use client";

import { useStore } from "@/components/AppStore";
import { Button, Spinner } from "@/components/ui";

const HIGHLIGHTS = [
  {
    title: "Ingest the whole ledger",
    body: "Every buyer on the accounts receivable file — not just the ones the client chose to insure.",
  },
  {
    title: "Score every name",
    body: "A transparent four-factor risk score with a full breakdown, so you can always show why.",
  },
  {
    title: "Expose the coverage gap",
    body: "See, in one chart, the large low-risk buyers sitting outside the programme.",
  },
  {
    title: "Answer in seconds",
    body: "Indicative limits and premium ranges instantly — versus a 2–4 week agency turnaround.",
  },
];

export function EmptyState() {
  const { loadDemoData, working } = useStore();
  const busy = working === "demo";

  return (
    <div className="relative overflow-hidden rounded-xl bg-navy-900 px-8 py-12 text-white shadow-lg">
      <div className="grid-texture pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #0fb5a6 0%, transparent 70%)" }}
      />
      <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-100/80 ring-1 ring-inset ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-brandteal" />
            Product concept demo
          </span>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">
            See the entire receivables book —{" "}
            <span className="text-brandteal">not just the part that&apos;s insured.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-navy-100/80">
            Trade credit insurance in Hong Kong is bought reactively: the client insures the buyers
            it already distrusts and keeps the rest of the ledger off-cover. Coface Connect ingests
            the full AR file, scores every counterparty, and makes that adverse selection visible —
            then turns it into an upsell conversation.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button variant="teal" onClick={() => void loadDemoData()} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <span aria-hidden>▶</span>}
              {busy ? "Generating portfolio…" : "Load Demo Data"}
            </Button>
            <span className="text-[12px] text-navy-100/60">
              Generates ~92 synthetic buyers, scores them and runs the alert engine.
            </span>
          </div>
          <p className="mt-3 text-[11px] text-navy-100/45">
            Or upload your own CSV / Excel file from the{" "}
            <a href="/upload" className="underline decoration-dotted hover:text-white">
              Upload Data
            </a>{" "}
            screen.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((item, index) => (
            <div
              key={item.title}
              className="rounded-lg bg-white/5 p-4 ring-1 ring-inset ring-white/10"
            >
              <span className="numeric text-[11px] font-bold text-brandteal">
                0{index + 1}
              </span>
              <p className="mt-1 text-[13px] font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-navy-100/70">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
