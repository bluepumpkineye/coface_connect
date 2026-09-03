import { db } from "@/db";
import { buyers as buyersTable } from "@/db/schema";
import { buildAssessment } from "@/lib/risk/assessment";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Instant coverage recommendation.
 *
 * The artificial delay below exists purely so the demo *feels* like an
 * underwriting engine doing work. In a real deployment this would call out to a
 * scoring/pricing service — here it is a transparent heuristic.
 */
const SIMULATED_PROCESSING_MS = 1500;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { buyerId?: number };
    const buyerId = Number(body?.buyerId);
    if (!Number.isFinite(buyerId)) {
      return Response.json({ error: "buyerId is required" }, { status: 400 });
    }

    const [buyer] = await db.select().from(buyersTable).where(eq(buyersTable.id, buyerId)).limit(1);
    if (!buyer) {
      return Response.json({ error: "Buyer not found" }, { status: 404 });
    }

    await new Promise((resolve) => setTimeout(resolve, SIMULATED_PROCESSING_MS));

    return Response.json({
      assessment: buildAssessment(buyer),
      buyer: { id: buyer.id, name: buyer.name, isInsured: buyer.isInsured },
    });
  } catch (error) {
    console.error("Assessment failed", error);
    return Response.json({ error: "Assessment failed" }, { status: 500 });
  }
}
