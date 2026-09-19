const SOURCE_URL = "https://cdn.tsetmc.com/api/ClosingPrice/GetMarketWatch?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9&withBestLimits=false&hEven=0&RefID=0";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; RubikaStockBridge/1.0)"
      },
      signal: AbortSignal.timeout(8000)
    });
    const contentType = response.headers.get("content-type") || "unknown";
    const raw = await response.text();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (!response.ok || !parsed) {
      return res.status(200).json({
        ok: false,
        source: "TSETMC CDN MarketWatch",
        reachable: response.ok,
        http_status: response.status,
        content_type: contentType,
        elapsed_ms: Date.now() - startedAt,
        diagnosis: "Source did not return a successful JSON response. It may be blocked, unavailable, or have changed its response format."
      });
    }

    const payload = parsed.marketwatch ?? parsed;
    const count = Array.isArray(payload) ? payload.length :
      Array.isArray(payload?.items) ? payload.items.length :
      Array.isArray(payload?.Items) ? payload.Items.length : null;

    return res.status(200).json({
      ok: true,
      source: "TSETMC CDN MarketWatch",
      reachable: true,
      http_status: response.status,
      content_type: contentType,
      top_level_keys: Object.keys(parsed),
      record_count: count,
      elapsed_ms: Date.now() - startedAt,
      note: count === 0
        ? "JSON was received, but no market rows were detected. Do not treat this as a valid live scan."
        : "Connectivity check only; scoring and live recommendations are not enabled by this endpoint."
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      source: "TSETMC CDN MarketWatch",
      reachable: false,
      elapsed_ms: Date.now() - startedAt,
      diagnosis: error instanceof Error ? error.message : "Unknown network error"
    });
  }
}
