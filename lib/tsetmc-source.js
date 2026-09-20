const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

const SOURCES = [
  {
    name: "tsetmc-cdn-marketwatch",
    url:
      "https://cdn.tsetmc.com/api/ClosingPrice/GetMarketWatch" +
      "?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3" +
      "&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6" +
      "&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9" +
      "&showTraded=false&withBestLimits=false&hEven=0&RefID=0",
    kind: "marketwatch",
  },
  {
    name: "tsetmc-cdn-daily-all",
    url: "https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyAllInst",
    kind: "daily-all",
  },
  {
    name: "tsetmc-legacy-marketwatch",
    url: "https://old.tsetmc.com/tsev2/excel/MarketWatchPlus.aspx?d=0",
    kind: "legacy",
  },
];

function unwrapRows(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["marketwatch", "marketWatch", "closingPriceDailyAllInst", "items", "Items", "data"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return null;
}

function looksLikeMarketRow(row) {
  return Boolean(
    row &&
      (row.insCode ?? row.inscode ?? row.InsCode) &&
      (row.lVal18AFC ?? row.symbol ?? row.Symbol || row.lVal30) &&
      (row.pClosing ?? row.pc ?? row.close ?? row.pDrCotVal ?? row.last)
  );
}

function normalizeRow(row) {
  const num = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  return {
    insCode: String(row.insCode ?? row.inscode ?? row.InsCode ?? ""),
    symbol: row.lVal18AFC ?? row.symbol ?? row.Symbol ?? "",
    name: row.lVal30 ?? row.name ?? row.Name ?? "",
    lastPrice: num(row.pDrCotVal, row.pl, row.last),
    closePrice: num(row.pClosing, row.pc, row.close),
    openPrice: num(row.pf, row.open),
    yesterdayPrice: num(row.py, row.priceYesterday),
    lowPrice: num(row.priceMin, row.low),
    highPrice: num(row.priceMax, row.high),
    tradeCount: num(row.zTotTran, row.count),
    volume: num(row.qTotTran5J, row.volume),
    tradeValue: num(row.qTotCap, row.value),
    baseVolume: num(row.baseVol),
    eps: num(row.eps, row.estimatedEPS),
    pe: num(row.pe),
    sectorPe: num(row.sectorPE),
    receivedAt: new Date().toISOString(),
    raw: row,
  };
}

async function fetchSource(source) {
  const started = Date.now();
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: source.kind === "legacy" ? "*/*" : "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(5000),
    });

    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {}

    const rows = unwrapRows(json);
    const normalized = rows ? rows.filter(looksLikeMarketRow).map(normalizeRow) : [];

    const blocked =
      /مسدود|دسترسی شما|General Error Detected/i.test(raw) ||
      (!json && /<html|<!doctype/i.test(raw));

    return {
      source: source.name,
      kind: source.kind,
      reachable: response.ok,
      httpStatus: response.status,
      contentType,
      responseChars: raw.length,
      recordCount: rows?.length ?? 0,
      validMarketRows: normalized.length,
      blocked,
      elapsedMs: Date.now() - started,
      rows: normalized,
    };
  } catch (error) {
    return {
      source: source.name,
      kind: source.kind,
      reachable: false,
      httpStatus: null,
      contentType: "",
      responseChars: 0,
      recordCount: 0,
      validMarketRows: 0,
      blocked: false,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown network error",
      rows: [],
    };
  }
}

export async function collectLiveMarket() {
  const results = [];
  for (const source of SOURCES) {
    const result = await fetchSource(source);
    results.push(result);
    if (result.validMarketRows >= 1000) {
      return buildResult(result, results);
    }
  }

  const best = results
    .filter((item) => item.validMarketRows > 0)
    .sort((a, b) => b.validMarketRows - a.validMarketRows)[0];

  return buildResult(best || null, results);
}

function buildResult(best, results) {
  const receivedAt = new Date().toISOString();
  const verified = Boolean(best && best.validMarketRows >= 1000);

  return {
    status: verified ? "LIVE_VERIFIED" : "LIVE_NOT_VERIFIED",
    verified,
    source: best?.source ?? null,
    receivedAt,
    marketDate: receivedAt.slice(0, 10),
    symbolCount: best?.validMarketRows ?? 0,
    rows: best?.rows ?? [],
    diagnostics: results.map(({ rows, ...rest }) => rest),
  };
}
