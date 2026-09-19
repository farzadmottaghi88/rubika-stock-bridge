const SOURCES = [
  {
    name: "TSETMC CDN MarketWatch",
    url: "https://cdn.tsetmc.com/api/ClosingPrice/GetMarketWatch?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9&withBestLimits=false&hEven=0&RefID=0",
    expected: "json"
  },
  {
    name: "TSETMC CDN10 MarketWatch",
    url: "https://cdn10.tsetmc.com/api/ClosingPrice/GetMarketWatch?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9&withBestLimits=false&hEven=0&RefID=0",
    expected: "json"
  },
  {
    name: "TSETMC legacy MarketWatch export",
    url: "https://old.tsetmc.com/tsev2/excel/MarketWatchPlus.aspx?d=0",
    expected: "binary-or-text"
  }
];

async function probe(source) {
  const startedAt = Date.now();
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: source.expected === "json" ? "application/json" : "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      },
      signal: AbortSignal.timeout(3500)
    });
    const contentType = response.headers.get("content-type") || "unknown";
    const raw = await response.text();
    let json = null;
    try { json = JSON.parse(raw); } catch {}
    const data = json?.marketwatch ?? json;
    const rows = Array.isArray(data) ? data :
      Array.isArray(data?.items) ? data.items :
      Array.isArray(data?.Items) ? data.Items : null;

    return {
      source: source.name,
      reachable: response.ok,
      http_status: response.status,
      content_type: contentType,
      response_chars: raw.length,
      json_valid: Boolean(json),
      record_count: rows ? rows.length : null,
      elapsed_ms: Date.now() - startedAt,
      usable_market_rows: Boolean(response.ok && rows?.length)
    };
  } catch (error) {
    return {
      source: source.name,
      reachable: false,
      elapsed_ms: Date.now() - startedAt,
      diagnosis: error instanceof Error ? error.message : "Unknown network error"
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const results = await Promise.all(SOURCES.map(probe));
  const working = results.some(item => item.usable_market_rows);
  return res.status(200).json({
    ok: working,
    purpose: "Connectivity diagnostics only; this endpoint does not produce trading signals.",
    usable_source_found: working,
    results
  });
}
