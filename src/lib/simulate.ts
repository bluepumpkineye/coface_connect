import { regenerateAlerts, rescoreAll, type PortfolioState } from "@/lib/portfolio";

/**
 * "Simulate Next Month" — a small random walk on payment behaviour, followed by
 * a full re-score and alert re-run. Illustrative only: it exists so the demo can
 * show what continuous monitoring looks like over time.
 */

function randomStep(): number {
  // Slightly biased towards deterioration, as a real book would be in a softening
  // cycle — enough movement to be interesting, not enough to be absurd.
  const gaussian = (Math.random() + Math.random() + Math.random() - 1.5) * 9;
  return Math.round(gaussian + 1.2);
}

export function simulateNextMonth(state: PortfolioState): { month: string; changed: number } {
  const month = new Date().toISOString().slice(0, 10);
  if (state.buyers.length === 0) return { month, changed: 0 };

  let changed = 0;
  for (const row of state.buyers) {
    const step = randomStep();
    const nextDaysLate = Math.max(0, Math.min(150, row.avgDaysLate + step));
    let nextTrend = row.paymentTrend;
    if (step >= 5) nextTrend = "worsening";
    else if (step <= -5) nextTrend = "improving";
    else if (Math.random() < 0.35) nextTrend = "stable";

    if (nextDaysLate !== row.avgDaysLate || nextTrend !== row.paymentTrend) changed += 1;

    row.avgDaysLate = nextDaysLate;
    row.paymentTrend = nextTrend;
  }

  rescoreAll(state);

  // Snapshots are written after scoring, so the trend chart picks up the new month.
  state.snapshots = [
    ...state.snapshots.filter((snapshot) => snapshot.snapshotDate !== month),
    ...state.buyers.map((row) => ({
      buyerId: row.id,
      snapshotDate: month,
      riskScore: row.riskScore,
    })),
  ];

  regenerateAlerts(state);
  return { month, changed };
}
