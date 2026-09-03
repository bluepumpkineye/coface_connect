import { buildPortfolioPayload } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await buildPortfolioPayload();
    return Response.json(payload);
  } catch (error) {
    console.error("Failed to load portfolio", error);
    return Response.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}
