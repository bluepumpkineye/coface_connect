import type { NewBuyer } from "@/db/schema";
import { scorePortfolio } from "@/lib/risk/scoring";

/**
 * ============================================================================
 * SYNTHETIC DEMO DATA GENERATOR
 * ============================================================================
 * Every company name, country, figure and trend below is fabricated. The
 * generator is tuned to reproduce one specific real-world pattern that this
 * product concept is designed to expose:
 *
 *   ADVERSE SELECTION — the client only insures the accounts it is most afraid
 *   of, leaving a large pool of good-quality, uninsured, unpaid receivables.
 *
 * Concretely, buyers flagged is_insured = true are deliberately skewed towards
 * worse payment behaviour, weaker geographies/sectors and larger exposures.
 * The uninsured 70% contains both genuinely good names (the missed
 * opportunity) and a tail of genuinely bad ones.
 * ============================================================================
 */

/** Deterministic PRNG so a given seed always rebuilds the same demo book. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNTRY_WEIGHTS: [string, number][] = [
  ["China (Mainland)", 26],
  ["Hong Kong SAR", 12],
  ["United States", 8],
  ["Vietnam", 6],
  ["Singapore", 5],
  ["Germany", 5],
  ["Indonesia", 4],
  ["Japan", 4],
  ["Taiwan", 3],
  ["Malaysia", 3],
  ["Thailand", 3],
  ["South Korea", 3],
  ["India", 3],
  ["United Kingdom", 3],
  ["Australia", 2],
  ["Netherlands", 2],
  ["United Arab Emirates", 2],
  ["Philippines", 2],
  ["Brazil", 1],
  ["Mexico", 1],
  ["Turkey", 1],
  ["Poland", 1],
  ["South Africa", 1],
  ["Nigeria", 1],
  ["Saudi Arabia", 1],
  ["Chile", 1],
];

/** Where the client's insured (feared) names tend to sit. */
const RISKY_COUNTRY_WEIGHTS: [string, number][] = [
  ["China (Mainland)", 26],
  ["Vietnam", 12],
  ["Indonesia", 11],
  ["Thailand", 8],
  ["India", 8],
  ["Turkey", 6],
  ["Brazil", 6],
  ["Mexico", 5],
  ["Nigeria", 5],
  ["Philippines", 5],
  ["United Arab Emirates", 4],
  ["South Africa", 4],
];

const INDUSTRY_WEIGHTS: [string, number][] = [
  ["Manufacturing", 18],
  ["Trading", 16],
  ["Electronics", 14],
  ["Retail", 10],
  ["Wholesale", 10],
  ["Food & Beverage", 8],
  ["Construction", 7],
  ["Logistics", 6],
  ["Textiles & Apparel", 5],
  ["Consumer Goods", 5],
  ["Industrial Machinery", 4],
  ["Building Materials", 4],
  ["Technology", 3],
  ["Automotive", 3],
  ["Healthcare", 2],
  ["Chemicals", 2],
];

const RISKY_INDUSTRY_WEIGHTS: [string, number][] = [
  ["Construction", 26],
  ["Building Materials", 16],
  ["Retail", 14],
  ["Textiles & Apparel", 12],
  ["Wholesale", 10],
  ["Trading", 10],
  ["Chemicals", 6],
  ["Automotive", 6],
];

const NAME_PREFIX = [
  "Golden", "Sunrise", "Pacific", "Evergreen", "Silverline", "Northbridge", "Kowloon",
  "Delta", "Zenith", "Apex", "Orion", "Meridian", "Grand", "Coral", "Ironwood", "Bluewater",
  "Harbour", "Vertex", "Summit", "Lotus", "Jade", "Pearl River", "Anchor", "Titan", "Nova",
  "Cascade", "Redwood", "Vanguard", "Eastgate", "Westport", "Crescent", "Sapphire", "Aurora",
  "Falcon", "Beacon", "Halo", "Onyx", "Lion Rock", "Amber", "Granite", "Mariner", "Pinnacle",
  "Silk Road", "Tamarind", "Quantum", "Regent", "Solstice", "Brightwell", "Copperfield",
];

const NAME_CORE = [
  "Electronics", "Trading", "Manufacturing", "Industries", "Holdings", "Logistics", "Supplies",
  "Group", "Components", "Distribution", "Textiles", "Foods", "Enterprises", "Technologies",
  "Machinery", "Materials", "Global", "Partners", "International", "Sourcing",
];

const NAME_SUFFIX = [
  "Ltd", "Limited", "Co., Ltd", "Pte Ltd", "Inc", "Sdn Bhd", "Group", "B.V.", "GmbH",
];

function pickWeighted(rand: () => number, table: [string, number][]): string {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return table[table.length - 1][0];
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(min + rand() * (max - min + 1));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function shuffle<T>(rand: () => number, items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Insured names: the client covers the big cheques. */
function drawInsuredExposure(rand: () => number): number {
  const roll = rand();
  if (roll < 0.1) return roundTo(150_000 + rand() * 250_000, 1000);
  if (roll < 0.45) return roundTo(400_000 + rand() * 500_000, 1000);
  if (roll < 0.8) return roundTo(900_000 + rand() * 700_000, 1000);
  return roundTo(1_600_000 + rand() * 800_000, 1000);
}

/** Uninsured names: mostly the tail of the ledger nobody got round to covering. */
function drawUninsuredExposure(rand: () => number): number {
  const roll = rand();
  if (roll < 0.55) return roundTo(10_000 + rand() * 50_000, 1000);
  if (roll < 0.85) return roundTo(60_000 + rand() * 100_000, 1000);
  if (roll < 0.96) return roundTo(160_000 + rand() * 190_000, 1000);
  return roundTo(350_000 + rand() * 300_000, 1000);
}

export type GeneratedBuyer = NewBuyer & { id?: number };

export type GenerationResult = {
  buyers: GeneratedBuyer[];
  snapshots: { buyerIndex: number; snapshotDate: string; riskScore: number }[];
  stats: {
    count: number;
    insuredCount: number;
    insuredAvgRisk: number;
    uninsuredAvgRisk: number;
    totalExposure: number;
  };
};

const MONTHS_OF_HISTORY = 6;

type Draft = {
  name: string;
  country: string;
  industry: string;
  outstandingAmount: number;
  avgDaysLate: number;
  paymentTrend: "improving" | "stable" | "worsening";
  buyerSince: string;
  creditLimitUsed: number;
  creditLimitRequested: number;
};

/**
 * Build the synthetic portfolio.
 * @param count number of buyers (default 92)
 * @param seed  PRNG seed
 */
export function generateDemoPortfolio(count = 92, seed = 20260215): GenerationResult {
  const rand = mulberry32(seed);

  const usedNames = new Set<string>();
  const makeName = (): string => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = `${pick(rand, NAME_PREFIX)} ${pick(rand, NAME_CORE)} ${pick(rand, NAME_SUFFIX)}`;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    const fallback = `Counterparty ${usedNames.size + 1}`;
    usedNames.add(fallback);
    return fallback;
  };

  const drafts: Draft[] = [];

  // ---- Step 1: draw payment behaviour, geography and sector ---------------
  for (let i = 0; i < count; i += 1) {
    const behaviourRoll = rand();
    let avgDaysLate: number;
    if (behaviourRoll < 0.3) avgDaysLate = randInt(rand, 0, 4);
    else if (behaviourRoll < 0.56) avgDaysLate = randInt(rand, 5, 16);
    else if (behaviourRoll < 0.79) avgDaysLate = randInt(rand, 18, 38);
    else if (behaviourRoll < 0.93) avgDaysLate = randInt(rand, 40, 68);
    else avgDaysLate = randInt(rand, 70, 110);

    const trendRoll = rand();
    const paymentTrend =
      trendRoll < 0.22 ? "improving" : trendRoll < 0.72 ? "stable" : "worsening";

    const year = randInt(rand, 2006, 2025);
    const month = randInt(rand, 1, 12);
    const day = randInt(rand, 1, 28);

    drafts.push({
      name: makeName(),
      country: pickWeighted(rand, COUNTRY_WEIGHTS),
      industry: pickWeighted(rand, INDUSTRY_WEIGHTS),
      outstandingAmount: 0,
      avgDaysLate,
      paymentTrend,
      buyerSince: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      creditLimitUsed: 0,
      creditLimitRequested: 0,
    });
  }

  // ---- Step 2: decide which names the client chose to insure --------------
  // Rank by a pre-score built from behaviour only, then take the worst ~30%
  // with heavy jitter — a skew, not a clean cut. This is the adverse selection
  // mechanic at the heart of the demo.
  const preScore = drafts.map((draft) => {
    const behaviour =
      draft.avgDaysLate >= 70
        ? 96
        : draft.avgDaysLate >= 40
          ? 80
          : draft.avgDaysLate >= 18
            ? 55
            : draft.avgDaysLate >= 5
              ? 30
              : 12;
    const trend = draft.paymentTrend === "worsening" ? 16 : draft.paymentTrend === "improving" ? -12 : 0;
    return behaviour * 0.6 + trend;
  });

  const ranked = drafts
    .map((_, index) => ({ index, score: preScore[index] + (rand() - 0.5) * 60 }))
    .sort((a, b) => b.score - a.score);

  const insuredCount = Math.round(count * 0.3);
  const insuredIndexes = new Set(ranked.slice(0, insuredCount).map((item) => item.index));
  const uninsuredIndexes = drafts.map((_, index) => index).filter((index) => !insuredIndexes.has(index));

  // ---- Step 3: shape the insured book ------------------------------------
  // Worse behaviour, weaker geographies/sectors, bigger cheques.
  drafts.forEach((draft, index) => {
    if (!insuredIndexes.has(index)) return;
    draft.avgDaysLate = Math.min(125, draft.avgDaysLate + randInt(rand, 12, 34));
    const trendRoll = rand();
    draft.paymentTrend = trendRoll < 0.55 ? "worsening" : trendRoll < 0.92 ? "stable" : "improving";
    if (rand() < 0.5) draft.country = pickWeighted(rand, RISKY_COUNTRY_WEIGHTS);
    if (rand() < 0.5) draft.industry = pickWeighted(rand, RISKY_INDUSTRY_WEIGHTS);
    draft.outstandingAmount = drawInsuredExposure(rand);
    draft.creditLimitUsed = roundTo(draft.outstandingAmount * (0.5 + rand() * 0.45), 1000);
    draft.creditLimitRequested = roundTo(draft.outstandingAmount * (1.05 + rand() * 0.7), 1000);
  });

  // ---- Step 3b: a few outright distressed names (drives the Critical band) -
  const distressedCount = Math.max(3, Math.round(insuredCount * 0.16));
  for (const { index } of ranked.slice(0, distressedCount)) {
    const draft = drafts[index];
    draft.avgDaysLate = randInt(rand, 88, 120);
    draft.paymentTrend = "worsening";
    draft.country = pickWeighted(rand, RISKY_COUNTRY_WEIGHTS);
    draft.industry = pickWeighted(rand, RISKY_INDUSTRY_WEIGHTS);
    draft.outstandingAmount = roundTo(2_200_000 + rand() * 1_200_000, 1000);
    draft.creditLimitUsed = roundTo(draft.outstandingAmount * 0.9, 1000);
    draft.creditLimitRequested = roundTo(draft.outstandingAmount * 1.4, 1000);
  }

  // ---- Step 4: shape the uninsured book ----------------------------------
  drafts.forEach((draft, index) => {
    if (insuredIndexes.has(index)) return;
    draft.outstandingAmount = drawUninsuredExposure(rand);
    draft.creditLimitUsed = roundTo(draft.outstandingAmount * (0.4 + rand() * 0.5), 1000);
    draft.creditLimitRequested = roundTo(draft.outstandingAmount * (1.0 + rand() * 0.6), 1000);
  });

  // ---- Step 4b: keep a genuine tail of BAD uninsured names ----------------
  // Adverse selection is a skew, not a clean cut — plenty of risky names sit
  // outside the programme (premium quoted too high, or never followed up).
  const badTailCount = Math.max(6, Math.round(uninsuredIndexes.length * 0.2));
  const badTail = new Set(
    shuffle(rand, uninsuredIndexes).slice(0, badTailCount),
  );
  for (const index of badTail) {
    const draft = drafts[index];
    draft.avgDaysLate = randInt(rand, 42, 95);
    draft.paymentTrend = rand() < 0.78 ? "worsening" : "stable";
    if (rand() < 0.4) draft.country = pickWeighted(rand, RISKY_COUNTRY_WEIGHTS);
    if (rand() < 0.4) draft.industry = pickWeighted(rand, RISKY_INDUSTRY_WEIGHTS);
    draft.outstandingAmount = roundTo(60_000 + rand() * 440_000, 1000);
  }

  // ---- Step 5: plant the "missed opportunity" cluster ---------------------
  // A handful of large, well-behaved, UNINSURED names — the dots the Coverage
  // Gap Matrix is designed to make impossible to miss. The three largest are
  // calibrated so each sits just above 10% of total uninsured exposure, which
  // is exactly what trips the concentration alert rule.
  const candidates = shuffle(rand, uninsuredIndexes.filter((index) => !badTail.has(index)));
  const anchorIndexes = candidates.slice(0, 3);
  const midTierIndexes = candidates.slice(3, 9);
  const calibratingSet = new Set([...anchorIndexes, ...midTierIndexes]);
  const restTotal = uninsuredIndexes
    .filter((index) => !calibratingSet.has(index))
    .reduce((sum, index) => sum + drafts[index].outstandingAmount, 0);

  // anchor A must exceed 10% of (rest + 6*mid + 3A) where mid = 0.6A.
  // Solving A / (rest + 6*0.6A + 3A) = 11% gives A ~= rest / 2.9.
  const anchorSize = Math.max(500_000, roundTo(restTotal / 2.9, 5000));
  const midSize = roundTo(anchorSize * 0.6, 5000);

  const makeGoodPayer = (draft: Draft, exposure: number) => {
    draft.outstandingAmount = exposure;
    draft.avgDaysLate = randInt(rand, 0, 5);
    draft.paymentTrend = rand() < 0.45 ? "improving" : "stable";
    draft.creditLimitUsed = roundTo(exposure * 0.8, 1000);
    draft.creditLimitRequested = roundTo(exposure * 1.25, 1000);
  };

  for (const index of anchorIndexes) makeGoodPayer(drafts[index], anchorSize);
  for (const index of midTierIndexes) makeGoodPayer(drafts[index], midSize);

  // ---- Step 6: score the whole book --------------------------------------
  const scored = scorePortfolio(drafts);

  const buyers: GeneratedBuyer[] = drafts.map((draft, index) => ({
    ...draft,
    isInsured: insuredIndexes.has(index),
    riskScore: scored[index].riskScore,
    riskBand: scored[index].riskBand,
    scoreBreakdown: scored[index].scoreBreakdown,
  }));

  // ---- Step 7: synthesise monthly history (random walk back from today) --
  const today = new Date();
  const snapshots: GenerationResult["snapshots"] = [];
  buyers.forEach((buyer, index) => {
    let walk = buyer.riskScore ?? 0;
    for (let monthsAgo = 0; monthsAgo < MONTHS_OF_HISTORY; monthsAgo += 1) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, 1));
      snapshots.push({
        buyerIndex: index,
        snapshotDate: date.toISOString().slice(0, 10),
        riskScore: Math.max(0, Math.min(100, Math.round(walk))),
      });
      walk = walk + (rand() - 0.42) * 8;
    }
  });

  const insuredScores = buyers.filter((b) => b.isInsured).map((b) => b.riskScore ?? 0);
  const uninsuredScores = buyers.filter((b) => !b.isInsured).map((b) => b.riskScore ?? 0);
  const avg = (values: number[]) =>
    values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;

  return {
    buyers,
    snapshots,
    stats: {
      count: buyers.length,
      insuredCount: insuredScores.length,
      insuredAvgRisk: avg(insuredScores),
      uninsuredAvgRisk: avg(uninsuredScores),
      totalExposure: buyers.reduce((sum, b) => sum + b.outstandingAmount, 0),
    },
  };
}
