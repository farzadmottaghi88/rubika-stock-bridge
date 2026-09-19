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

async function sendRubika(text) {
  const token = process.env.RUBIKA_BOT_TOKEN;
  const chatId = process.env.RUBIKA_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Missing RUBIKA_BOT_TOKEN or RUBIKA_CHAT_ID");
  }

  const url = `https://botapi.rubika.ir/v3/${encodeURIComponent(token)}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(`Rubika API error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "rubika-stock-bridge",
      endpoint: "/api/rubika"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const expectedSecret = process.env.BRIDGE_SECRET;
  if (expectedSecret) {
    const suppliedSecret = req.headers["x-bridge-secret"];
    if (suppliedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = { text: body };
    }
  }

  const text = body?.text ?? body?.report ?? body?.message;
  if (!text || !String(text).trim()) {
    return res.status(400).json({
      ok: false,
      error: "Missing text/report/message"
    });
  }

  try {
    const chunks = splitMessage(text);
    for (let i = 0; i < chunks.length; i++) {
      await sendRubika(chunks[i]);
    }

    return res.status(200).json({
      ok: true,
      sent_chunks: chunks.length
    });
  } catch (error) {
    console.error("Rubika bridge error:", error);
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
