import { buildPortfolioPayload, loadDemoData } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let seed: number | undefined;
    try {
      const body = (await request.json()) as { seed?: number };
      if (typeof body?.seed === "number" && Number.isFinite(body.seed)) seed = body.seed;
    } catch {
      // No body / invalid JSON — fall back to the default seed.
    }

    const stats = await loadDemoData(seed);
    const payload = await buildPortfolioPayload();
    return Response.json({ stats, ...payload });
  } catch (error) {
    console.error("Failed to generate demo data", error);
    return Response.json({ error: "Failed to generate demo data" }, { status: 500 });
  }
}
