import { setBuyerInsured } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * Improvement 1 — live policy mutation.
 * Flips is_insured, auto-resolves that buyer's open alerts, re-runs the rule
 * engine and returns a freshly computed portfolio payload so the client never
 * holds a derived number that could go stale.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const buyerId = Number(id);
    if (!Number.isInteger(buyerId)) {
      return Response.json({ error: "Invalid buyer id" }, { status: 400 });
    }

    let insured = true;
    try {
      const body = (await request.json()) as { insured?: boolean };
      if (typeof body?.insured === "boolean") insured = body.insured;
    } catch {
      // Default to true when no body is supplied.
    }

    const outcome = await setBuyerInsured(buyerId, insured);
    if (!outcome) return Response.json({ error: "Buyer not found" }, { status: 404 });

    return Response.json({
      autoResolved: outcome.resolvedAlerts,
      buyerId,
      insured,
      ...outcome.portfolio,
    });
  } catch (error) {
    console.error("Failed to update insured status", error);
    return Response.json({ error: "Failed to update insured status" }, { status: 500 });
  }
}
