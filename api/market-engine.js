import { analyzeMarket } from "../lib/market-engine.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "market-engine",
      mode: "normalized-data",
      message: "Engine is ready. A verified live market data source is still required."
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (!Array.isArray(rows)) {
      return res.status(400).json({
        ok: false,
        error: "Expected JSON array or { rows: [] }"
      });
    }

    return res.status(200).json({
      ok: true,
      ...analyzeMarket(rows)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
