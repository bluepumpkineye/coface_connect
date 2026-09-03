import { buildPortfolioPayload } from "@/lib/portfolio";
import { simulateNextMonth } from "@/lib/simulate";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await simulateNextMonth();
    const payload = await buildPortfolioPayload();
    return Response.json({ simulation: result, ...payload });
  } catch (error) {
    console.error("Failed to simulate month", error);
    return Response.json({ error: "Failed to simulate month" }, { status: 500 });
  }
}
