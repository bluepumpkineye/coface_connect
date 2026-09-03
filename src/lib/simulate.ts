import { db } from "@/db";
import { buyers as buyersTable, portfolioSnapshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { regenerateAlerts, rescoreAll } from "@/lib/portfolio";

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

export async function simulateNextMonth(): Promise<{ month: string; changed: number }> {
  const rows = await db.select().from(buyersTable);
  if (rows.length === 0) return { month: new Date().toISOString().slice(0, 10), changed: 0 };

  let changed = 0;
  for (const row of rows) {
    const step = randomStep();
    const nextDaysLate = Math.max(0, Math.min(150, row.avgDaysLate + step));
    let nextTrend = row.paymentTrend;
    if (step >= 5) nextTrend = "worsening";
    else if (step <= -5) nextTrend = "improving";
    else if (Math.random() < 0.35) nextTrend = "stable";

    if (nextDaysLate !== row.avgDaysLate || nextTrend !== row.paymentTrend) changed += 1;

    await db
      .update(buyersTable)
      .set({ avgDaysLate: nextDaysLate, paymentTrend: nextTrend })
      .where(eq(buyersTable.id, row.id));
  }

  await rescoreAll();

  const scored = await db.select().from(buyersTable);
  const month = new Date().toISOString().slice(0, 10);
  const snapshotRows = scored.map((row) => ({
    buyerId: row.id,
    snapshotDate: month,
    riskScore: row.riskScore,
  }));
  for (let i = 0; i < snapshotRows.length; i += 400) {
    await db.insert(portfolioSnapshots).values(snapshotRows.slice(i, i + 400));
  }

  await regenerateAlerts();
  return { month, changed };
}
