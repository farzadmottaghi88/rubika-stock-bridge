import { collectLiveMarket } from "../lib/tsetmc-source.js";
import { analyzeMarket, analyzeSignals } from "../lib/market-engine.js";

const MAX_MESSAGE_LENGTH = 3500;

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "-";
}

function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
  const normalized = String(text).replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLength) return [normalized];

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n\n", maxLength);
    if (cut < maxLength * 0.5) cut = remaining.lastIndexOf("\n", maxLength);
    if (cut < maxLength * 0.5) cut = remaining.lastIndexOf(" ", maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendRubika(chatId, text) {
  const token = process.env.RUBIKA_BOT_TOKEN;

  if (!token || !chatId) {
    throw new Error("Missing RUBIKA_BOT_TOKEN or chat_id");
  }

  const url = `https://botapi.rubika.ir/v3/${encodeURIComponent(token)}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!response.ok || data?.ok === false || data?.status === "ERROR") {
    throw new Error(`Rubika API error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function extractIncomingMessage(body) {
  const update = body?.update ?? body;
  const message = update?.new_message ?? update?.message ?? body?.message;

  return {
    type: update?.type,
    chatId: update?.chat_id ?? message?.chat_id,
    text: message?.text ?? update?.text ?? body?.text,
    messageId: message?.message_id ?? update?.message_id
  };
}

function normalizeCommand(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[‌\u200c]/g, " ")
    .replace(/\s+/g, " ");
}

async function handleIncomingUpdate(body) {
  const incoming = extractIncomingMessage(body);

  if (!incoming.chatId) {
    return { handled: false, reason: "No chat_id in update" };
  }

  const text = normalizeCommand(incoming.text);
  if (!text) {
    return { handled: true, replied: false, reason: "Non-text update" };
  }

  let reply;

  switch (text) {
    case "/start":
    case "start":
      reply =
        "🤖 ربات پایش بورس ایران فعال شد.\n\n" +
        "دستورهای قابل استفاده:\n" +
        "• بررسی بازار — فهرست نمادهای منتخب\n" +
        "• تحلیل بازار — تحلیل کامل‌تر\n" +
        "• /status — وضعیت ربات\n" +
        "• /help — راهنما\n\n" +
        "داده زنده و موتور تحلیل در حال پایش و تکمیل هستند.";
      break;

    case "/help":
    case "help":
    case "راهنما":
      reply =
        "📊 راهنمای ربات بورس ایران\n\n" +
        "🔹 بررسی بازار\n" +
        "نمادهای منتخب بر اساس فیلترهای تابلو، ورود پول، قدرت خریدار، حجم و روند.\n\n" +
        "🔹 تحلیل بازار\n" +
        "بررسی تفصیلی نمادها شامل ورود پول حقیقی، قدرت خریدار، سرانه خرید/فروش، حجم، ارزش معاملات، رفتار حقوقی، صف و عمق، نقدشوندگی، روند و ارزش‌گذاری.\n\n" +
        "🔹 /status\n" +
        "وضعیت اتصال ربات.\n\n" +
        "اتصال Rubika و Vercel فعال است؛ داده زنده TSETMC نیز در حال اعتبارسنجی است.";
      break;

    case "/status":
    case "status": {
      const live = await collectLiveMarket();
      const diag = live.diagnostics?.map(d =>
        `• ${d.source}: ${d.validMarketRows || 0} نماد معتبر${d.error ? ` — ${d.error}` : ""}`
      ).join("\n") || "• بدون داده";
      reply =
        "✅ وضعیت ربات\n\n" +
        "Rubika: متصل ✅\n" +
        "Vercel: متصل ✅\n" +
        "Webhook: فعال ✅\n" +
        `داده زنده بورس: ${live.verified ? "تأیید شد ✅" : "تأیید نشد ❌"}\n` +
        `منبع: ${live.source || "نامشخص"}\n` +
        `تعداد نماد معتبر: ${live.symbolCount}\n\n` +
        "Diagnostics:\n" + diag;
      break;
    }

    case "بررسی بازار":
    case "/بررسی بازار":
    case "بررسی":
    case "/market":
    case "market": {
      const live = await collectLiveMarket();
      if (!live.verified) {
        reply = "⚠️ داده زنده بازار تأیید نشد؛ تحلیل و سیگنال تولید نشد.";
        break;
      }

      const result = analyzeMarket(live.rows);
      const candidates = result.selected;
      reply = candidates.length
        ? "📈 بررسی بازار — نمادهای منتخب\n\n" +
          candidates.map((r, i) => {
            const reasons = [];
            if (Number(r.realMoneyFlowRatio) > 1) reasons.push(`پول حقیقی ${Number(r.realMoneyFlowRatio).toFixed(1)}x`);
            if (Number(r.buyerPower) > 1) reasons.push(`قدرت خریدار ${Number(r.buyerPower).toFixed(1)}x`);
            if (Number(r.volumeRatio30d) >= 3) reasons.push(`حجم ${Number(r.volumeRatio30d).toFixed(1)}x`);
            if (r.resistanceBreak) reasons.push("شکست مقاومت ۲۰روزه");
            else if (Number(r.sma20) > Number(r.sma50)) reasons.push("SMA20>SMA50");
            return `${i + 1}. ${r.symbol} — ${reasons.slice(0, 2).join("، ") || "فیلتر ترکیبی"}`;
          }).join("\n")
        : "📈 داده زنده دریافت شد، اما با فیلترهای فعلی نماد واجد شرایط پیدا نشد.";
      break;
    }

    case "سیگنال بازار":
    case "/سیگنال بازار":
    case "سیگنال":
    case "/signals":
    case "signals": {
      const live = await collectLiveMarket();
      if (!live.verified) {
        reply = "⚠️ داده زنده بازار تأیید نشد؛ سیگنال تولید نشد.";
        break;
      }

      const result = analyzeSignals(live.rows);
      const rows = result.selected;
      const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "-";
      const pct = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
      const rr = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}x` : "-";
      const receivedAt = live.receivedAt ? new Date(live.receivedAt).toLocaleString("fa-IR") : "-";

      reply = rows.length
        ? "🎯 سیگنال بازار — فقط موارد دارای فیلتر کامل\\n" +
          `زمان: ${receivedAt} | اسکن: ${result.scanned} نماد | سیگنال: ${rows.length}\\n\\n` +
          rows.map((r, i) => {
            const p = r.tradePlan;
            return [
              `${i + 1}. ${r.symbol} | امتیاز ${r.score}`,
              `ورود: ${fmt(p.entry)} | حدضرر: ${fmt(p.stop)} | هدف: ${fmt(p.target)}`,
              `ریسک: ${pct(p.riskPercent)} | بازده هدف: ${pct(p.rewardPercent)} | R/R: ${rr(p.riskReward)}`,
              `پول حقیقی: ${rr(r.realMoneyFlowRatio)} | قدرت خریدار: ${rr(r.buyerPower)} | حجم: ${rr(r.volumeRatio30d)}`,
              `حمایت۲۰: ${fmt(r.support20d)} | مقاومت۲۰: ${fmt(r.resistance20d)} | ارزش نظری: ${fmt(r.theoreticalPrice)}`
            ].join("\\n");
          }).join("\\n\\n")
        : "🎯 با داده فعلی، نمادی که هم فیلتر تابلو/روند و هم R/R حداقل ۲ داشته باشد پیدا نشد.";
      break;
    }

    case "تحلیل بازار":
    case "/تحلیل بازار":
    case "تحلیل":
    case "/analysis":
    case "analysis": {
      const live = await collectLiveMarket();
      if (!live.verified) {
        reply = "⚠️ داده زنده بازار تأیید نشد؛ تحلیل و سیگنال تولید نشد.";
        break;
      }

      const result = analyzeMarket(live.rows);
      const rows = result.selected;
      const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "-";
      const pct = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
      const ratio = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}x` : "-";

      const receivedAt = live.receivedAt ? new Date(live.receivedAt).toLocaleString("fa-IR") : "-";
      reply = rows.length
        ? "📊 تحلیل بازار — داده زنده TSETMC\n" +
          `زمان دریافت: ${receivedAt} | اسکن: ${result.scanned} نماد | خروجی: ${rows.length} نماد\n\n` +
          rows.map((r, i) => [
            `${i + 1}. ${r.symbol} | امتیاز ${r.score}`,
            `پول حقیقی: ${ratio(r.realMoneyFlowRatio)} | قدرت: ${ratio(r.buyerPower)}`,
            `سرانه حقیقی خرید/فروش: ${fmt(r.avgNaturalBuyValue)} / ${fmt(r.avgNaturalSellValue)} ریال`,
            `حجم: ${fmt(r.volume)} | میانگین۳۰: ${fmt(r.volumeAvg30d)} | نسبت: ${ratio(r.volumeRatio30d)}`,
            `ارزش: ${fmt(r.tradeValue)} | معاملات: ${fmt(r.tradeCount)}`,
            `حقوقی: ${r.legalBehavior} | خالص: ${fmt(r.legalNetVolume)}`,
            `عمق: تقاضا ${fmt(r.bestBidVolume)} / عرضه ${fmt(r.bestAskVolume)} | نسبت ${ratio(r.orderBookDemandRatio)}`,
            `نقدشوندگی: ${Math.round(r.liquidityScore ?? 0)} | روند: ${r.trendState}`,
            `SMA20/50: ${fmt(r.sma20)} / ${fmt(r.sma50)} | مقاومت۲۰: ${fmt(r.resistance20d)} | شکست: ${r.resistanceBreak ? "بله" : "خیر"}`,
            `ارزش‌گذاری: ${r.valuationState} | EPS ${fmt(r.eps)} | P/E گروه ${ratio(r.sectorPe)} | نظری ${fmt(r.theoreticalPrice)} | فاصله ${pct(r.peGapPercent)}`
          ].join("\n")).join("\n\n")
        : "📊 داده زنده دریافت شد، اما با فیلترهای فعلی نماد واجد شرایط پیدا نشد.";
      break;
    }

    default:
      reply =
        "پیامت دریافت شد ✅\n\n" +
        "برای دستورات قابل استفاده /help را بفرست.";
  }

  const chunks = splitMessage(reply);
  for (const chunk of chunks) {
    await sendRubika(incoming.chatId, chunk);
  }

  return {
    handled: true,
    replied: true,
    chat_id: incoming.chatId,
    message_id: incoming.messageId ?? null
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "rubika-stock-bridge",
      endpoint: "/api/rubika",
      mode: "webhook"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const expectedSecret = process.env.BRIDGE_SECRET;
  if (expectedSecret && req.headers["x-bridge-secret"] !== expectedSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = { text: body };
    }
  }

  if (body?.update || body?.new_message || body?.type === "NewMessage") {
    try {
      const result = await handleIncomingUpdate(body);
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Rubika incoming update error:", error);
      return res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  const chatId = body?.chat_id;
  const text = body?.text ?? body?.report ?? body?.message;

  if (!chatId || !text || !String(text).trim()) {
    return res.status(400).json({
      ok: false,
      error: "Missing chat_id or text/report/message"
    });
  }

  try {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await sendRubika(chatId, chunk);
    }

    return res.status(200).json({
      ok: true,
      sent_chunks: chunks.length
    });
  } catch (error) {
    console.error("Rubika outbound error:", error);
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
