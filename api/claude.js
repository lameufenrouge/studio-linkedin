import { requireAuth } from "./_auth.js";

// OpenRouter si OPENROUTER_API_KEY est défini, sinon API Anthropic directe
const useOR = !!process.env.OPENROUTER_API_KEY;
const MODELS = useOR ? {
  complex: process.env.MODEL_COMPLEX || "anthropic/claude-opus-5.5",
  default: process.env.MODEL_DEFAULT || "anthropic/claude-sonnet-5",
  quick: process.env.MODEL_QUICK || "anthropic/claude-haiku-4.5",
} : {
  complex: process.env.MODEL_COMPLEX || "claude-opus-5-5",
  default: process.env.MODEL_DEFAULT || "claude-sonnet-5",
  quick: process.env.MODEL_QUICK || "claude-haiku-4-5-20251001",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireAuth(req, res)) return;
  const { input, tier = "default" } = req.body || {};
  const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "bad_input" });
  const model = MODELS[tier] || MODELS.default;

  const upstream = useOR
    ? await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "X-Title": "Studio LinkedIn",
        },
        body: JSON.stringify({ model, max_tokens: 8000, stream: true, messages }),
      })
    : await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 8000, stream: true, messages }),
      });

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => "");
    console.error("Erreur fournisseur IA", upstream.status, model, txt);
    return res.status(upstream.status === 429 ? 429 : 502).json({ error: upstream.status === 429 ? "rate_limited" : "upstream_error" });
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "", truncated = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (useOR) {
          const c = ev.choices?.[0];
          if (c?.delta?.content) res.write(c.delta.content);
          if (c?.finish_reason === "length") truncated = true;
        } else {
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") res.write(ev.delta.text);
          if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") truncated = true;
        }
      } catch {}
    }
  }
  if (truncated) res.write("\u0000TRUNCATED");
  res.end();
}
