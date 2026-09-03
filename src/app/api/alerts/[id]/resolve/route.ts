import { resolveAlertById } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/** Improvement 6 — dismiss an alert and archive it in the resolved list. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const alertId = Number(id);
    if (!Number.isInteger(alertId)) {
      return Response.json({ error: "Invalid alert id" }, { status: 400 });
    }

    const portfolio = await resolveAlertById(alertId);
    if (!portfolio) return Response.json({ error: "Alert not found" }, { status: 404 });

    return Response.json({ resolvedAlertId: alertId, ...portfolio });
  } catch (error) {
    console.error("Failed to resolve alert", error);
    return Response.json({ error: "Failed to resolve alert" }, { status: 500 });
  }
}
