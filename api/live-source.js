import { collectLiveMarket } from "../lib/tsetmc-source.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const result = await collectLiveMarket();

  return res.status(result.verified ? 200 : 503).json({
    ok: result.verified,
    status: result.status,
    source: result.source,
    received_at: result.receivedAt,
    market_date: result.marketDate,
    symbol_count: result.symbolCount,
    diagnostics: result.diagnostics,
  });
}
