const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

const MARKETWATCH_URL =
  "http://old.tsetmc.com/tsev2/data/MarketWatchInit.aspx?h=0&r=0";
const CLIENTTYPE_URL =
  "http://old.tsetmc.com/tsev2/data/ClientTypeAll.aspx";

const CDN_MARKETWATCH_URL =
  "https://cdn.tsetmc.com/api/ClosingPrice/GetMarketWatch" +
  "?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3" +
  "&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6" +
  "&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9" +
  "&showTraded=false&withBestLimits=false&hEven=0&RefID=0";

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseLegacyMarketWatch(raw) {
  const parts = String(raw).split("@");
  if (parts.length < 5) return { rows: [], bestLimits: [], refId: null };

  const states = parts[2] || "";
  const bestLimitsRaw = parts[3] || "";
  const refId = num(parts[4]);

  const rows = states
    .split(";")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(","))
    .filter(a => a.length >= 23)
    .map(a => ({
      insCode: a[0],
      isin: a[1],
      symbol: a[2],
      name: a[3],
      heven: num(a[4]),
      open: num(a[5]),
      close: num(a[6]),
      last: num(a[7]),
      tradeCount: num(a[8]),
      volume: num(a[9]),
      value: num(a[10]),
      low: num(a[11]),
      high: num(a[12]),
      yesterday: num(a[13]),
      eps: num(a[14]),
      baseVolume: num(a[15]),
      visitCount: num(a[16]),
      flow: num(a[17]),
      cs: a[18],
      tmax: num(a[19]),
      tmin: num(a[20]),
      z: num(a[21]),
      yval: a[22],
      predicted: num(a[23]),
      buyOpen: num(a[24]),
      changePercent: a[25]
    }));

  const bestLimits = bestLimitsRaw
    .split(";")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(","))
    .filter(a => a.length >= 8)
    .map(a => ({
      insCode: a[0],
      level: num(a[1]),
      bidCount: num(a[2]),
      bidPrice: num(a[3]),
      bidVolume: num(a[4]),
      askPrice: num(a[5]),
      askVolume: num(a[6]),
      askCount: num(a[7])
    }));

  return { rows, bestLimits, refId };
}

function unwrapJsonRows(json, keys) {
  if (Array.isArray(json)) return json;
  for (const key of keys) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

function normalizeCdnRow(row) {
  return {
    insCode: String(row.insCode ?? row.inscode ?? row.InsCode ?? ""),
    symbol: row.lVal18AFC ?? row.symbol ?? row.Symbol ?? "",
    name: row.lVal30 ?? row.name ?? row.Name ?? "",
    lastPrice: num(row.pDrCotVal ?? row.pl ?? row.last),
    closePrice: num(row.pClosing ?? row.pc ?? row.close),
    openPrice: num(row.pf ?? row.open),
    yesterdayPrice: num(row.py ?? row.priceYesterday),
    lowPrice: num(row.priceMin ?? row.low),
    highPrice: num(row.priceMax ?? row.high),
    tradeCount: num(row.zTotTran ?? row.tno ?? row.count),
    volume: num(row.qTotTran5J ?? row.tvol ?? row.volume),
    tradeValue: num(row.qTotCap ?? row.tval ?? row.value),
    baseVolume: num(row.baseVol ?? row.bvol),
    eps: num(row.eps ?? row.estimatedEPS),
    pe: num(row.pe),
    sectorPe: num(row.sectorPE),
    heven: num(row.hEven ?? row.heven),
    receivedAt: new Date().toISOString(),
    raw: row
  };
}

function normalizeLegacyRow(row) {
  return {
    insCode: String(row.insCode || ""),
    symbol: row.symbol || "",
    name: row.name || "",
    lastPrice: row.last,
    closePrice: row.close,
    openPrice: row.open,
    yesterdayPrice: row.yesterday,
    lowPrice: row.low,
    highPrice: row.high,
    tradeCount: row.tradeCount,
    volume: row.volume,
    tradeValue: row.value,
    baseVolume: row.baseVolume,
    eps: row.eps,
    pe: null,
    sectorPe: null,
    heven: row.heven,
    flow: row.flow,
    receivedAt: new Date().toISOString(),
    raw: row
  };
}

function parseClientType(raw) {
  return String(raw)
    .split(";")
    .map(x => x.trim())
    .filter(Boolean)
    .map(line => line.split(","))
    .filter(a => a.length >= 9)
    .map(a => ({
      insCode: String(a[0]),
      naturalBuyCount: num(a[1]),
      legalBuyCount: num(a[2]),
      naturalBuyVolume: num(a[3]),
      legalBuyVolume: num(a[4]),
      naturalSellCount: num(a[5]),
      legalSellCount: num(a[6]),
      naturalSellVolume: num(a[7]),
      legalSellVolume: num(a[8])
    }));
}

function mergeClientType(rows, clientRows) {
  const map = new Map(clientRows.map(x => [x.insCode, x]));
  return rows.map(row => {
    const c = map.get(row.insCode);
    if (!c) return row;

    const realBuy = Number(c.naturalBuyVolume) || 0;
    const realSell = Number(c.naturalSellVolume) || 0;
    const realBuyValue = realBuy * (Number(row.lastPrice) || 0);
    const realSellValue = realSell * (Number(row.lastPrice) || 0);
    const realMoneyFlowRatio = realSellValue > 0 ? realBuyValue / realSellValue : null;
    const buyerPower =
      c.naturalBuyCount > 0 && c.naturalSellCount > 0
        ? (realBuy / c.naturalBuyCount) / (realSell / c.naturalSellCount)
        : null;

    return {
      ...row,
      naturalBuyCount: c.naturalBuyCount,
      legalBuyCount: c.legalBuyCount,
      naturalBuyVolume: realBuy,
      legalBuyVolume: c.legalBuyVolume,
      naturalSellCount: c.naturalSellCount,
      legalSellCount: c.legalSellCount,
      naturalSellVolume: realSell,
      legalSellVolume: c.legalSellVolume,
      realMoneyFlow: realBuyValue - realSellValue,
      realMoneyFlowRatio,
      buyerPower
    };
  });
}

function mergeBestLimits(rows, limits) {
  const byCode = new Map();
  for (const x of limits) {
    if (!byCode.has(x.insCode)) byCode.set(x.insCode, []);
    byCode.get(x.insCode).push(x);
  }
  return rows.map(row => {
    const levels = (byCode.get(row.insCode) || []).sort((a,b) => (a.level ?? 99) - (b.level ?? 99));
    const l1 = levels[0];
    return {
      ...row,
      bestBidPrice: l1?.bidPrice ?? null,
      bestBidVolume: l1?.bidVolume ?? null,
      bestBidCount: l1?.bidCount ?? null,
      bestAskPrice: l1?.askPrice ?? null,
      bestAskVolume: l1?.askVolume ?? null,
      bestAskCount: l1?.askCount ?? null,
      orderBookLevels: levels
    };
  });
}

async function fetchText(url, accept = "*/*") {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000)
  });
  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    raw
  };
}

async function collectLegacy() {
  const started = Date.now();
  try {
    const [market, client] = await Promise.all([
      fetchText(MARKETWATCH_URL),
      fetchText(CLIENTTYPE_URL)
    ]);
    const parsed = parseLegacyMarketWatch(market.raw);
    const clients = parseClientType(client.raw);
    let rows = parsed.rows.map(normalizeLegacyRow);
    rows = mergeClientType(rows, clients);
    rows = mergeBestLimits(rows, parsed.bestLimits);

    const valid = rows.filter(r => r.insCode && r.symbol && Number.isFinite(Number(r.lastPrice)));
    const hevens = valid.map(r => r.heven).filter(Number.isFinite);
    const latestHeven = hevens.length ? Math.max(...hevens) : null;

    return {
      source: "tsetmc-legacy-marketwatch-init",
      reachable: market.ok && client.ok,
      httpStatus: market.status,
      contentType: market.contentType,
      responseChars: market.raw.length,
      recordCount: parsed.rows.length,
      clientRecordCount: clients.length,
      validMarketRows: valid.length,
      blocked: /مسدود|دسترسی شما|General Error Detected/i.test(market.raw),
      latestHeven,
      elapsedMs: Date.now() - started,
      rows: valid
    };
  } catch (error) {
    return {
      source: "tsetmc-legacy-marketwatch-init",
      reachable: false,
      validMarketRows: 0,
      rows: [],
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown network error"
    };
  }
}

async function collectCdn() {
  const started = Date.now();
  try {
    const result = await fetchText(CDN_MARKETWATCH_URL, "application/json");
    let json = null;
    try { json = JSON.parse(result.raw); } catch {}
    const rows = unwrapJsonRows(json, ["marketwatch", "marketWatch", "data"])
      .map(normalizeCdnRow)
      .filter(r => r.insCode && r.symbol && Number.isFinite(Number(r.lastPrice)));

    return {
      source: "tsetmc-cdn-marketwatch",
      reachable: result.ok,
      httpStatus: result.status,
      contentType: result.contentType,
      responseChars: result.raw.length,
      recordCount: rows.length,
      validMarketRows: rows.length,
      blocked: /مسدود|دسترسی شما|General Error Detected/i.test(result.raw),
      elapsedMs: Date.now() - started,
      rows
    };
  } catch (error) {
    return {
      source: "tsetmc-cdn-marketwatch",
      reachable: false,
      validMarketRows: 0,
      rows: [],
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown network error"
    };
  }
}

export async function collectLiveMarket() {
  const results = [];

  const legacy = await collectLegacy();
  results.push(legacy);
  if (legacy.validMarketRows >= 500) return buildResult(legacy, results);

  const cdn = await collectCdn();
  results.push(cdn);
  if (cdn.validMarketRows >= 500) return buildResult(cdn, results);

  const best = results
    .filter(x => x.validMarketRows > 0)
    .sort((a,b) => b.validMarketRows - a.validMarketRows)[0] || null;

  return buildResult(best, results);
}

function buildResult(best, results) {
  const verified = Boolean(
    best &&
    best.reachable &&
    !best.blocked &&
    best.validMarketRows >= 500
  );

  return {
    status: verified ? "LIVE_VERIFIED" : "LIVE_NOT_VERIFIED",
    verified,
    source: best?.source ?? null,
    receivedAt: new Date().toISOString(),
    marketDate: new Date().toISOString().slice(0,10),
    symbolCount: best?.validMarketRows ?? 0,
    latestHeven: best?.latestHeven ?? null,
    rows: best?.rows ?? [],
    diagnostics: results.map(({rows, ...rest}) => rest)
  };
}
