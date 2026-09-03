"use client";

import { useState } from "react";
import { useStore } from "@/components/AppStore";
import { Button, Card, CardHeader, Pill } from "@/components/ui";

const INTEGRATIONS = [
  {
    name: "Xero",
    tagline: "Cloud accounting",
    detail:
      "Pull the full accounts receivable ledger, contact metadata and payment history. Auto-detect new buyers as invoices are raised.",
    initials: "Xe",
    accent: "#13B5EA",
    status: "Phase 2",
  },
  {
    name: "QuickBooks",
    tagline: "Small-business accounting",
    detail:
      "Match customer records to Coface buyers and sync outstanding balances daily, including multi-currency ledgers.",
    initials: "QB",
    accent: "#2CA01C",
    status: "Phase 2",
  },
  {
    name: "SAP",
    tagline: "Enterprise ERP",
    detail:
      "S/4HANA and ECC connectors for large corporate clients. Handles blocked-invoice logic and credit-management master data.",
    initials: "SA",
    accent: "#0FAAFF",
    status: "Phase 2",
  },
  {
    name: "Oracle NetSuite",
    tagline: "Cloud ERP",
    detail:
      "SuiteTalk / SuiteQL extraction of AR ageing with entity-level rollups for group buyer structures.",
    initials: "NS",
    accent: "#C74634",
    status: "Roadmap",
  },
  {
    name: "Manual upload",
    tagline: "CSV / Excel",
    detail:
      "Always available as a fallback — no integration required. Column mapping and validation handled in the browser.",
    initials: "CSV",
    accent: "#0FB5A6",
    status: "Live now",
  },
];

const ROADMAP = [
  {
    phase: "Phase 1 — today",
    tone: "bg-teal-50 text-teal-800 ring-teal-200",
    items: [
      "Full-ledger ingestion via CSV / Excel",
      "Transparent four-factor risk score per buyer",
      "Adverse selection visualisation and coverage gap matrix",
      "Rule-based early warning and upsell alerts",
      "Instant indicative limit + premium range",
    ],
  },
  {
    phase: "Phase 2 — next",
    tone: "bg-navy-50 text-navy-800 ring-navy-100",
    items: [
      "Daily auto-sync from Xero, QuickBooks and SAP",
      "Broker / underwriter collaboration workspace",
      "Policy proposal generation with one-click submission",
      "Payment-behaviour alerts pushed by email and WhatsApp",
    ],
  },
  {
    phase: "Later",
    tone: "bg-slate-50 text-slate-700 ring-slate-200",
    items: [
      "Group-structure entity resolution across ledgers",
      "Sector and macro overlay from Coface economic research",
      "Claims and collections workflow inside the same view",
    ],
  },
];

export function ConnectedSystems() {
  const { pushToast } = useStore();
  const [sync, setSync] = useState<Record<string, boolean>>(
    Object.fromEntries(INTEGRATIONS.map((item) => [item.name, item.name === "Manual upload"])),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-900">Connected systems</h1>
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-slate-500">
          The demo runs on a manual upload. In the production concept, Coface Connect would sit on
          top of the client&apos;s existing accounting stack and refresh itself — which is what turns
          a one-off portfolio review into continuous monitoring.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((integration) => (
          <Card key={integration.name} className="flex flex-col">
            <div className="flex items-start gap-3 px-5 py-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                style={{ backgroundColor: integration.accent }}
              >
                {integration.initials}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-semibold text-navy-900">{integration.name}</h2>
                  <Pill tone={integration.status === "Live now" ? "teal" : "slate"}>
                    {integration.status}
                  </Pill>
                </div>
                <p className="text-[11.5px] text-slate-500">{integration.tagline}</p>
              </div>
            </div>
            <p className="flex-1 px-5 pb-4 text-[12.5px] leading-relaxed text-slate-600">
              {integration.detail}
            </p>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <Button
                size="sm"
                variant={integration.status === "Live now" ? "secondary" : "primary"}
                onClick={() =>
                  pushToast("Coming soon — Phase 2. Use manual upload for now.", "info")
                }
              >
                {integration.status === "Live now" ? "Open" : "Connect"}
              </Button>
              <label className="flex items-center gap-2 text-[11.5px] font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(sync[integration.name])}
                  onChange={(event) =>
                    setSync((current) => ({ ...current, [integration.name]: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 accent-navy-800"
                />
                Enable daily auto-sync
              </label>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Roadmap"
          subtitle="Where this demo sits in the product concept — shown for context only"
        />
        <div className="grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-3">
          {ROADMAP.map((phase) => (
            <div key={phase.phase} className={`rounded-xl px-4 py-4 ring-1 ring-inset ${phase.tone}`}>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em]">{phase.phase}</p>
              <ul className="mt-2.5 space-y-1.5">
                {phase.items.map((item) => (
                  <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-slate-700">
                    <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Demo settings" subtitle="These controls are illustrative only" />
        <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              { label: "Alert frequency", options: ["Daily digest", "Real time", "Weekly summary"] },
              { label: "Risk model version", options: ["Illustrative v1 (this demo)", "CUBE (production concept)"] },
              { label: "Portfolio currency", options: ["USD", "HKD", "CNY", "EUR"] },
            ] as { label: string; options: string[] }[]
          ).map((group) => (
            <label key={group.label} className="flex flex-col gap-1.5">
              <span className="label-xs">{group.label}</span>
              <select
                defaultValue={group.options[0]}
                onChange={() => pushToast("Setting saved locally — demo only.", "success")}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[12.5px] text-navy-900 outline-none focus:border-navy-500"
              >
                {group.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
