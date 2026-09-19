const MAX_MESSAGE_LENGTH = 3500;

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
        "موتور تحلیل بازار در مرحله اتصال به داده‌های بورس قرار دارد.";
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
        "در حال حاضر اتصال Rubika و Vercel فعال است؛ مرحله بعد اتصال موتور داده و تحلیل بورس است.";
      break;

    case "/status":
    case "status":
      reply =
        "✅ وضعیت ربات\n\n" +
        "Rubika: متصل ✅\n" +
        "Vercel: متصل ✅\n" +
        "Webhook: فعال ✅\n" +
        "موتور تحلیل بورس: در حال اتصال ⏳";
      break;

    case "بررسی بازار":
    case "/بررسی بازار":
    case "بررسی":
    case "/market":
    case "market":
      reply =
        "📈 درخواست «بررسی بازار» دریافت شد.\n\n" +
        "اتصال موتور تحلیل و داده‌های بازار هنوز تکمیل نشده است. " +
        "بعد از اتصال، پاسخ به‌صورت خودکار در همین چت ارسال می‌شود.";
      break;

    case "تحلیل بازار":
    case "/تحلیل بازار":
    case "تحلیل":
    case "/analysis":
    case "analysis":
      reply =
        "📊 درخواست «تحلیل بازار» دریافت شد.\n\n" +
        "موتور تحلیل تفصیلی هنوز به منابع بازار متصل نشده است. " +
        "در مرحله بعد همین فرمان به موتور تحلیل متصل می‌شود.";
      break;

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
