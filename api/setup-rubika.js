export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const token = process.env.RUBIKA_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "Missing RUBIKA_BOT_TOKEN" });
  }

  const host = req.headers.host;
  if (!host) {
    return res.status(400).json({ ok: false, error: "Missing host header" });
  }

  const webhookUrl = `https://${host}/api/rubika`;
  const url = `https://botapi.rubika.ir/v3/${encodeURIComponent(token)}/updateBotEndpoints`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      type: "ReceiveUpdate"
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  return res.status(response.ok ? 200 : 502).json({
    ok: response.ok && data?.status !== "ERROR",
    webhook_url: webhookUrl,
    rubika: data
  });
}
