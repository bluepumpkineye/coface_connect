import { buildPortfolioPayload, resetPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await resetPortfolio();
    const payload = await buildPortfolioPayload();
    return Response.json(payload);
  } catch (error) {
    console.error("Failed to reset portfolio", error);
    return Response.json({ error: "Failed to reset portfolio" }, { status: 500 });
  }
}
