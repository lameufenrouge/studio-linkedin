// Lit une page web publique et renvoie son texte (pour « Nourrir l'IA »)
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?)/i;
const decode = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

export default async function handler(req, res) {
  let url;
  try { url = new URL(String(req.query.url || "")); } catch { return res.status(400).json({ error: "Lien invalide" }); }
  if (!/^https?:$/.test(url.protocol) || PRIVATE.test(url.hostname)) return res.status(400).json({ error: "Lien non autorisé" });
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; StudioSigne/1.0)", Accept: "text/html,text/plain" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return res.status(502).json({ error: `La page répond ${r.status} (elle est peut-être privée)` });
    const type = r.headers.get("content-type") || "";
    if (/pdf/i.test(type)) return res.status(415).json({ error: "C'est un PDF : télécharge-le et ajoute-le avec « PDF / doc »" });
    const raw = (await r.text()).slice(0, 2_000_000);
    const title = decode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").trim();
    let text = raw;
    if (/html/i.test(type)) {
      text = raw.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
      text = decode(text);
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim().slice(0, 120000);
    if (text.length < 200) return res.status(422).json({ error: "Page vide ou protégée : copie-colle son texte dans « Écrire »" });
    res.status(200).json({ title, text });
  } catch (e) {
    res.status(502).json({ error: "Impossible de lire cette page (" + (e.name === "TimeoutError" ? "trop lente" : "injoignable") + ")" });
  }
}
