import { setBuyerLimit } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/** Improvement 2 — replace a buyer's in-force policy limit. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const buyerId = Number(id);
    if (!Number.isInteger(buyerId)) {
      return Response.json({ error: "Invalid buyer id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { creditLimit?: number };
    const creditLimit = Number(body?.creditLimit);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      return Response.json({ error: "creditLimit must be a positive number" }, { status: 400 });
    }

    const outcome = await setBuyerLimit(buyerId, creditLimit);
    if (!outcome) return Response.json({ error: "Buyer not found" }, { status: 404 });

    return Response.json({
      autoResolved: outcome.resolvedAlerts,
      buyerId,
      creditLimit: Math.round(creditLimit),
      ...outcome.portfolio,
    });
  } catch (error) {
    console.error("Failed to update credit limit", error);
    return Response.json({ error: "Failed to update credit limit" }, { status: 500 });
  }
}
