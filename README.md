# Coface Connect — Portfolio Visibility & Risk Monitoring (Demo)

A standalone, self-contained demo web app illustrating a product concept for **Coface Hong Kong**:
a tool that ingests a client's **entire accounts receivable ledger** (not just the buyers they chose
to insure), scores every buyer for credit risk, and makes **adverse selection** visible — then turns
it into an upsell conversation.

> **This is a demo, not a product.**
> All buyers, names, countries, figures, scores, limits and premiums are **synthetic**. The scoring
> model is a **simplified, transparent heuristic** written for this demo — it is **not** Coface's CUBE
> engine, not an actuarial model, and not a credit decisioning system. There is **no** connection to
> any real Coface system, API or dataset.

---

## Why this exists

### 1. The adverse selection problem

Trade credit insurance in Hong Kong is bought reactively. A typical client insures the handful of
buyers it is already nervous about — the late payers, the awkward geographies, the big scary cheque —
and leaves the rest of the ledger off-cover. The result is a programme that is:

- **expensive per dollar of cover** (the insured book is, by construction, the worst book), and
- **full of holes** — a large pool of good-quality, low-risk, uninsured receivables that nobody ever
  quoted.

This demo makes that pattern visible in one screen. On a freshly generated demo book you should see
something like:

> **Insured book average risk: 63/100 (High) vs Uninsured book average risk: 37/100 (Medium)**

…while roughly **half the portfolio's dollar exposure still sits uninsured**. The Coverage Gap Matrix
shows the same thing spatially: red (insured) dots clustered in the high-risk zone, and a cluster of
large, low-risk, blue (uninsured) dots in the bottom-left — the missed opportunity.

### 2. The Hong Kong / China market context

- Around **70% of the client base is from mainland China**, operating out of Hong Kong, with buyer
  exposure spread across the world. The demo dataset reflects that: ~26% mainland China, ~12% Hong
  Kong SAR, and a long tail across Asia, Europe, the Americas, Africa and the Middle East.
- These clients are typically **SMEs with lean finance teams**. They cannot wait weeks for a risk
  answer, and they will not hand-build an insured buyer list by hand.
- **Government trade credit agencies** (e.g. export credit agencies) are the default alternative for
  many, and their turnaround on a buyer assessment is commonly **2–4 weeks**. That is the
  competitive gap this concept attacks: if the ledger is already connected, the answer is instant.
  The *Instant Coverage Recommendation* modal in this demo makes that contrast explicit.

### 3. What "connected" buys you

A one-off spreadsheet review becomes continuous monitoring: scores drift, payment behaviour
worsens, concentration builds — and the platform flags it before it becomes a claim. The
**Connected Systems** page is a non-functional mockup of that roadmap (Xero, QuickBooks, SAP, plus a
roadmap view).

---

## Tech stack

Single full-stack app — one repo, one deploy.

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | **Next.js 16 (App Router) + React 19 + TypeScript**                     |
| Styling    | **Tailwind CSS v4**                                                     |
| Charts     | **Recharts** (scatter, bar, line)                                        |
| State      | **In-browser, persisted to localStorage** — no database                   |
| File parse | **papaparse** (CSV) + **xlsx** (Excel), both client-side in the browser |
| PDF export | **jsPDF + jspdf-autotable**, client-side                                  |
| Auth       | None — single-user demo                                                  |

**Why Next.js instead of Vite + Express?** One repo, one build, one deploy target, no CORS. It
deploys to Vercel as-is (or Render/Railway with `npm run build && npm run start`).

**Why no database?** Every buyer in this demo is synthetic and generated deterministically from a
seed, so there is nothing worth persisting that cannot be rebuilt instantly. The whole book lives
in memory in the browser and is mirrored to localStorage, which makes the app fully static: no
infrastructure to provision, no environment variables, no migrations, and nothing to fail at
deploy time. Actions mutate that in-memory book directly, which is exactly what the interactivity
pass calls for.

The buyer, snapshot and alert shapes still live in `src/db/schema.ts` as plain TypeScript types, so
putting a real database back in later means reimplementing a single module (`src/lib/portfolio.ts`)
behind the same contract.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

There is no database to set up and nothing to configure. A first visit generates the demo book
automatically, so the dashboard is already populated when it loads. **“Regenerate Demo Data”**
rebuilds it from a fresh seed, and **“Clear workspace”** empties it so the **“Load Demo Data”**
onboarding flow can be shown live. That button:

1. generates ~92 synthetic buyers (see below),
2. scores every one of them,
3. writes 6 months of monthly history snapshots, and
4. runs the rule-based alert engine.

No other setup is required. Nothing else in the app assumes demo data — you can wipe it and upload
your own CSV/Excel instead.

Production build:

```bash
npm run build && npm run start
```

Health check: `GET /api/health` → `{"ok":true}`

---

## The demo dataset

`src/lib/demo/generator.ts` builds a deterministic (seeded) synthetic book. It is deliberately
shaped so the adverse-selection story is legible:

- **~92 buyers**, weighted to mainland China / Hong Kong SAR plus a worldwide tail, across 16
  industries.
- **~30% flagged `is_insured = true`**, and those are **skewed towards worse payment behaviour,
  weaker geographies/sectors and larger exposures**. This is the adverse selection mechanic.
- The uninsured 70% contains **both** a large pool of well-behaved names (the missed opportunity)
  **and** a genuine tail of risky ones (~20%) — because adverse selection is a skew, not a clean cut.
- Exposures range from ~$10K to ~$3.4M, log-distributed, so there is visible concentration risk.
- The three largest uninsured names are **calibrated** so each sits just above 10% of total
  uninsured exposure — which is exactly what trips the concentration alert rule.
- 6 months of monthly history are synthesised as a backwards random walk, so the trend chart is
  populated on first load.

Typical output on a fresh generate (varies slightly by seed):

```
buyers 92 | insured 28 (30%) | exposure insured 52%
insured avg risk 63 (High)  vs  uninsured avg risk 37 (Medium)   → gap +26 pts
bands       Low  Med  High  Crit
  insured     0    4    20     4
  uninsured  15   32    17     0
alerts: 3 concentration · 29 deterioration · 9 upsell
```

---

## The scoring engine (simulated CUBE)

`src/lib/risk/scoring.ts`. **Illustrative only — deliberately simple, fully transparent, no ML.**

Every buyer gets a `risk_score` from 0 (safest) to 100 (riskiest), computed from four weighted
sub-scores:

| Factor                   | Weight | How it is derived                                                                                                       |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Payment behaviour**    | 40%    | Anchor points on `avg_days_late` (0d→8, 15d→30, 30d→55, 45d→75, 60d→90, 90d→98) plus a directional adjustment for trend. |
| **Country risk**         | 20%    | Static illustrative lookup table of country indices (0–100) for the countries used in the demo.                          |
| **Industry risk**        | 20%    | Static illustrative lookup table of sector indices (0–100).                                                               |
| **Concentration**        | 20%    | `outstanding_amount / total portfolio exposure`, scaled so that 6% of the book in one name = 100.                          |

Bands: **0–25 Low · 26–50 Medium · 51–75 High · 76–100 Critical**.

The full breakdown (`{payment, country, industry, concentration, weights, exposureShare}`) is stored
on every buyer row and surfaced in the UI — click any buyer name in the table to expand "why this
score". Because concentration depends on the *total* book, scoring always runs portfolio-wide in a
single pass (`scorePortfolio`).

Static lookup tables live at the top of `scoring.ts` and are hand-set for the demo's countries and
industries. **They are not real sovereign or sector risk ratings.**

---

## The alert engine

`src/lib/risk/alerts.ts`. Deterministic, rule-based, recomputed whenever the ledger changes.

| Alert                | Rule                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **Concentration**    | Uninsured buyer > **10% of total uninsured exposure**.                                            |
| **Deterioration**    | `payment_trend = worsening` **AND** risk band Medium or above.                                    |
| **Upsell opportunity** | Uninsured **AND** band Low/Medium **AND** exposure in the **top 30%** of portfolio exposure.    |

Thresholds are computed from the live portfolio (70th exposure percentile, uninsured book total) and
shown in the UI so nothing is hidden.

**“Simulate Next Month”** applies a small random walk to each buyer's `avg_days_late` and
`payment_trend`, re-scores the whole book, appends a new monthly snapshot, and re-runs the alert
engine — demonstrating ongoing monitoring rather than a one-off review.

---

## Instant coverage recommendation

Click **“Get Instant Assessment”** on any uninsured buyer in the table. After a deliberately
simulated ~1.5s of "processing", the modal shows:

- **Risk band** and score,
- **Suggested credit limit** — requested exposure × a band factor (Low 90%, Medium 70%, High 45%,
  Critical 20%),
- **Indicative premium range** — band-based % of the covered limit (Low 0.30–0.50%, Medium
  0.60–1.00%, High 1.20–2.00%, Critical 2.50–4.00%),
- the four weighted score drivers, and
- a footer callout: *"Typical government trade credit agency turnaround: 2–4 weeks. Coface Connect:
  instant."*

All figures are illustrative. Not a quotation.

---

## File / folder structure

```
src/
├── app/
│   ├── layout.tsx                  # Shell: top nav, toast host, demo disclaimer footer
│   ├── page.tsx                    # Dashboard
│   ├── upload/page.tsx             # CSV / Excel upload + column mapping
│   ├── alerts/page.tsx             # Alert queue + rule reference
│   ├── settings/page.tsx           # Connected Systems mockup + roadmap
│   ├── globals.css                 # Tailwind v4 theme (navy / teal / amber)
│   └── api/
│       ├── health/route.ts         # GET  — liveness + DB ping
│       ├── portfolio/route.ts      # GET  — buyers + summary + alerts + history
│       ├── demo-data/route.ts      # POST — generate synthetic book, score, alert
│       ├── reset/route.ts          # POST — wipe everything
│       ├── simulate-month/route.ts # POST — random walk, re-score, re-alert
│       ├── assessment/route.ts     # POST — instant limit + premium (simulated latency)
│       └── ingest/route.ts         # POST — mapped rows -> scored buyers
├── components/
│   ├── AppStore.tsx                # Client store: fetch + all mutations + toasts
│   ├── TopNav.tsx                  # Dashboard | Upload Data | Alerts | Connected Systems
│   ├── ui.tsx                      # Card, Button, Pill, BandBadge, Spinner, ToastHost
│   ├── dashboard/
│   │   ├── Dashboard.tsx           # Page composition + drill-down filter state
│   │   ├── SummaryCards.tsx        # Headline adverse-selection stat + KPI tiles
│   │   ├── CoverageGapMatrix.tsx   # Scatter: risk vs exposure, log Y, sized by exposure
│   │   ├── Charts.tsx              # Risk histogram, monitored trend
│   │   ├── BuyerTable.tsx          # Sortable/filterable ledger + expandable score breakdown
│   │   ├── AlertsList.tsx          # Shared alert card list
│   │   ├── AssessmentModal.tsx     # Unified modal: new coverage OR re-assessment
│   │   ├── ExportReport.tsx        # jsPDF portfolio report
│   │   └── EmptyState.tsx          # "Load Demo Data" onboarding hero
│   ├── upload/UploadData.tsx       # File drop, parse, mapping, preview, import
│   ├── alerts/AlertsView.tsx       # Alerts page
│   └── settings/ConnectedSystems.tsx
├── db/
│   └── schema.ts                   # Buyer / snapshot / alert types (plain TS)
└── lib/
    ├── risk/scoring.ts             # Simulated CUBE: weights, lookups, bands
    ├── risk/alerts.ts              # Rule engine + thresholds
    ├── risk/assessment.ts          # Limit factors + indicative premium rates
    ├── demo/generator.ts           # Synthetic portfolio with adverse-selection skew
    ├── portfolio.ts                # Server service: rescore, alerts, summary aggregation
    ├── simulate.ts                 # "Simulate Next Month"
    ├── upload.ts                   # Template, aliases, auto-mapping, sample CSV
    ├── format.ts                   # Money / pct / band colours
    └── types.ts                    # Client mirrors of API payload types
```

---

## Interactivity — actions that actually change the app

Every action mutates real state and every dependent number, chart, badge and table row updates
without a reload. The pattern is deliberately boring: **the in-memory buyer book is the single
source of truth**. A mutation edits that book, re-runs the rule engine, then recomputes the
*entire* portfolio payload from the buyers array, and the UI replaces its state with that payload.
Nothing is derived anywhere else, so a stale number is structurally impossible.

| Action | Where | Endpoint | Effect |
| --- | --- | --- | --- |
| **Add to Policy** | Assessment modal (uninsured buyer) | `POST /api/buyers/[id]/insure` | `is_insured = true`, dot flips blue→red in the Coverage Gap Matrix, histogram segment moves, ledger badge + button change, all summary cards and both book averages recompute, that buyer's open alerts auto-resolve |
| **Update Policy Limit** | Assessment modal (insured buyer) | `POST /api/buyers/[id]/limit` | `credit_limit_used` replaced, re-assessment card shows old→new with a coloured delta |
| **Resolve** ✓ | Alert cards | `POST /api/alerts/[id]/resolve` | Alert leaves the active queue, moves to the resolved archive, open-alert counts (nav badge + summary tile) decrement |
| **Get Instant Assessment / Re-assess / Quote Cover / Review Limit** | Ledger table, alert cards, scatter dots | — | All open the **same** modal component |

### One modal, two modes

`AssessmentModal` reads `buyer.isInsured` and switches:

- **Uninsured** → *"Instant Coverage Recommendation"* with risk band, suggested limit, indicative
  premium, and a teal **Add to Policy** button.
- **Insured** → *"Re-assessment"* with the current limit and the newly suggested limit side by side
  (`Current: $2.5M → Suggested: $2.8M ▲`, red/amber when lower, green when higher), and an amber
  **Update Policy Limit** button.

The four-factor score breakdown is identical in both modes. Button colour is consistent everywhere:
**teal = new coverage**, **amber = re-assessment**.

### Toasts

Custom, zero-dependency toast host — bottom-right, auto-dismisses after ~4.2s, never blocks
interaction. Fires on Add to Policy, Update Policy Limit and Resolve, including the side effects:

> ✓ *Pacific Industries Ltd added to policy. Insured exposure +$3.1M. 2 related alerts cleared.*

### Drill-down filtering

Clickable: the **Buyers insured**, **Uninsured low/medium risk** and **Uninsured high/critical risk**
summary cards, **every bar segment** in the risk distribution chart, and **every dot** in the
Coverage Gap Matrix (opens the modal). Cards and bars get a hover lift/ring so it's discoverable;
applying a drill-down smooth-scrolls to the ledger and shows a removable chip —
`Filtered: Uninsured · High/Critical risk ✕` — with a *Reset to all buyers* link.

### Alert lifecycle

Resolution is keyed on `(buyer_id, type)` and carried across regenerations, so clicking
*Simulate Next Month* does not resurrect an alert somebody already dealt with. Resolved alerts whose
rule no longer fires (e.g. the buyer has since been insured) are kept in the archive as an audit
trail rather than silently disappearing.

### Chart tooltips

All three charts share one tooltip primitive: dark navy `#08172e`, white text, `rounded-xl`,
matching ring and shadow. The Coverage Gap Matrix tooltip shows name, country, industry,
outstanding, score + band, days late, portfolio share and insured status; the trend chart shows the
exact monthly average for both books; the histogram shows the exact buyer count per band/segment.

---

## Uploading your own ledger

**Upload Data** accepts `.csv` and `.xlsx` (parsed in the browser — the file never leaves your
machine, only the mapped rows are POSTed):

1. Drop or browse to a file.
2. Columns are **auto-matched** using an alias table (`buyer_name`, `customer`, `account_name`,
   `ar_balance`, `days_past_due`, …). Adjust any mapping manually.
3. Preview the first five mapped rows.
4. Import — **replace** the current portfolio or **append**.
5. An ingestion summary shows: buyers loaded, rows skipped, how many were already insured (and what
   %), and total exposure.

Required columns: **buyer name** and **outstanding amount**. Everything else is optional and
defaults sensibly. `payment_trend` accepts `improving` / `stable` / `worsening`; `is_insured`
accepts `yes`/`no`/`true`/`false`/`1`/`0`/`insured`/`covered`.

A sample CSV template is downloadable from the same screen.

---

## Export

**Export Portfolio Report** on the dashboard generates a landscape A4 PDF containing the headline
adverse-selection comparison, portfolio summary metrics, the alert counts, and the full buyer table
sorted by risk score — with a "synthetic data / illustrative model" footer on every page.

---

## Deployment

Every route is statically prerendered and there is no backend, no database and no environment
variable to set.

**Vercel** — import the repo and deploy. Nothing else to configure.

**Render / Railway / any static host**

- Build: `npm install && npm run build`
- Start: `npm run start`

Because the book is generated in the browser, every visitor gets their own independent copy of the
demo and anything they change is local to them — one person clicking “Add to Policy” can never
affect what anybody else sees.

---

## Notes, caveats and honest limitations

- **Everything is synthetic.** Company names are generated from word lists. Any resemblance to a
  real company is coincidental.
- **The scoring model is illustrative and deliberately simple.** Real trade credit underwriting uses
  far richer data — financials, group structures, sector and macro overlays, claims history,
  payment behaviour over far longer windows, and expert judgement. The point here is to demonstrate
  *transparency and explainability*, not accuracy.
- **Country and industry indices are hand-set**, not sourced. They are not Coface views and must not
  be quoted as such.
- **Premium rates are placeholders** chosen to be plausible-looking. They are not a quotation and
  carry no underwriting authority.
- The **instant assessment latency is artificial** (`setTimeout` in the API route) — it exists to
  make the demo feel like an engine doing work.
- The **Connected Systems page is a visual mockup**. No integration exists or is attempted.
- No auth, no multi-tenancy, no audit trail. Single-user demo.
