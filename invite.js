import crypto from "node:crypto";
import { requireAuth } from "./_auth.js";
import { supaBase, supaHeaders } from "./_supa.js";

// Envoie au client le lien de son espace, depuis hello@agencesigne.com (via Resend)
const FROM = () => process.env.MAIL_FROM || "Laurine de signé. <hello@agencesigne.com>";
const REPLY = () => process.env.MAIL_REPLY_TO || "hello@agencesigne.com";
const docs = () => `${supaBase()}/rest/v1/studio_docs`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function getVoix(id) {
  const r = await fetch(`${docs()}?collection=eq.voix&id=eq.${encodeURIComponent(id)}&select=id,data&limit=1`, { headers: supaHeaders() });
  const x = r.ok ? (await r.json())[0] : null;
  return x ? { id: x.id, ...x.data } : null;
}
async function saveVoix(v) {
  const data = { ...v, updatedAt: Date.now() }; delete data.id;
  const r = await fetch(`${docs()}?on_conflict=collection,id`, {
    method: "POST", headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "voix", id: v.id, data, updated_at: Date.now() }),
  });
  if (!r.ok) throw new Error("db");
}
const SIG = base => ({
  name: process.env.SIGNATURE_NAME || "Laurine Bemer",
  role: process.env.SIGNATURE_ROLE || "Co-fondatrice",
  photo: process.env.SIGNATURE_PHOTO_URL || (base ? `${base}/signature-laurine.png` : ""),
  email: REPLY(),
  site: process.env.SIGNATURE_SITE || "agencesigne.com",
});
export function signatureHtml(base) {
  const s = SIG(base), initials = s.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatar = s.photo
    ? `<img src="${esc(s.photo)}" width="76" height="76" alt="${esc(s.name)}" style="display:block;width:76px;height:76px;border-radius:38px;border:0">`
    : `<div style="width:76px;height:76px;border-radius:38px;background:#3B4BFF;color:#ffffff;font-size:24px;font-weight:700;line-height:76px;text-align:center">${esc(initials)}</div>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;color:#16134A">
<tr>
<td style="vertical-align:middle;padding:0 18px 0 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#D9D5FF;border-radius:44px;padding:4px">${avatar}</td></tr></table>
</td>
<td style="vertical-align:middle;padding:0">
<div style="font-size:18px;font-weight:700;letter-spacing:-.3px;line-height:1.2;color:#16134A">${esc(s.name)}</div>
<div style="font-size:13px;color:#5E5B85;margin-top:3px">${esc(s.role)} · <span style="font-weight:700;color:#16134A">signé<span style="color:#3B4BFF">.</span></span></div>
<div style="width:36px;height:3px;background:#3B4BFF;border-radius:2px;margin:10px 0 0;font-size:0;line-height:0">&nbsp;</div>
</td>
</tr></table>`;
}
export function mailContent(prenom, url, base) {
  const hi = prenom ? `Bonjour ${esc(prenom)},` : "Bonjour,";
  const li = t => `<tr><td style="vertical-align:top;padding:0 10px 10px 0;color:#3B4BFF;font-weight:700">→</td><td style="padding:0 0 10px;font-size:16px;line-height:1.55;color:#16134A">${t}</td></tr>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1EFFF;font-family:Helvetica,Arial,sans-serif;color:#16134A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFFF;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:22px;overflow:hidden">
<tr><td style="background:#16134A;padding:30px 36px 34px;color:#F1EFFF">
<div style="font-size:26px;font-weight:800;letter-spacing:-1px">signé<span style="color:#3B4BFF">.</span></div>
<div style="font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1.1;margin-top:22px">Bienvenue${prenom ? " " + esc(prenom) : ""} !</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:20px;line-height:1.3;margin-top:10px;color:#D9D5FF">Vos idées. Nos mots. Votre nom en bas.</div>
</td></tr>
<tr><td style="padding:32px 36px 8px;font-size:16px;line-height:1.65;color:#16134A">
<p style="margin:0 0 16px">${hi}</p>
<p style="margin:0 0 16px">On est vraiment heureux de démarrer avec vous. Pour que tout soit simple entre nous, on vous a préparé un espace rien qu'à vous.</p>
<p style="margin:0 0 12px">C'est là que vous pourrez :</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
${li("relire et valider vos posts avant qu'ils partent sur LinkedIn,")}
${li("valider votre planning en un clic,")}
${li("nous envoyer une idée, une anecdote, un vocal ou vos photos dès qu'elle vous vient. Même à 23h, même en vrac : c'est exactement ce qu'on aime.")}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="background:#3B4BFF;border-radius:14px">
<a href="${esc(url)}" style="display:inline-block;padding:16px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px">Ouvrir mon espace</a>
</td></tr></table>
<p style="margin:0 0 16px">Pas de compte à créer, pas de mot de passe à retenir : gardez simplement ce lien en favori, ou ajoutez-le sur l'écran d'accueil de votre téléphone.</p>
<p style="margin:0 0 24px">Et si vous avez la moindre question, répondez à ce mail. C'est nous qui vous lisons, pas un robot.</p>
<p style="margin:0 0 18px">À très vite,</p>
${signatureHtml(base)}
</td></tr>
<tr><td style="padding:24px 36px 30px"><div style="border-top:1px solid #E4E1F5;padding-top:14px;font-size:12px;line-height:1.5;color:#8A87AD">Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :<br><a href="${esc(url)}" style="color:#3B4BFF;word-break:break-all">${esc(url)}</a></div></td></tr>
</table></td></tr></table></body></html>`;
  const s = SIG(base);
  const text = `${prenom ? "Bonjour " + prenom : "Bonjour"},

On est vraiment heureux de démarrer avec vous. Pour que tout soit simple entre nous, on vous a préparé un espace rien qu'à vous :
${url}

C'est là que vous pourrez :
→ relire et valider vos posts avant qu'ils partent sur LinkedIn,
→ valider votre planning en un clic,
→ nous envoyer une idée, une anecdote, un vocal ou vos photos dès qu'elle vous vient. Même à 23h, même en vrac.

Pas de compte à créer, pas de mot de passe : gardez simplement ce lien en favori.
Et si vous avez la moindre question, répondez à ce mail. C'est nous qui vous lisons, pas un robot.

À très vite,
${s.name}
${s.role} · signé.`;
  return { subject: `${prenom ? prenom + ", votre" : "Votre"} espace signé. vous attend`, html, text };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!(await requireAuth(req, res))) return;
  try {
    const v = await getVoix(String(req.body?.voixId || ""));
    if (!v) return res.status(404).json({ error: "Client introuvable." });
    const to = String(v.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: "L'email du client est manquant ou invalide." });
    if (!v.depotToken || req.body?.newLink) { v.depotToken = crypto.randomBytes(24).toString("base64url"); }
    const base = process.env.APP_URL || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const url = `${base.replace(/\/$/, "")}/d/${v.depotToken}`;
    const prenom = String(v.nom || "").split(/\s+/)[0] || "";
    const mail = mailContent(prenom, url, base.replace(/\/$/, ""));
    if (req.body?.preview) { await saveVoix(v); return res.status(200).json({ ...mail, url, to }); }
    if (!process.env.RESEND_API_KEY) { await saveVoix(v); return res.status(503).json({ error: "L'envoi automatique n'est pas encore branché (clé Resend manquante dans Vercel). Le lien est prêt : copie-le depuis « Espace client ».", url }); }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM(), to: [to], reply_to: REPLY(),
        subject: mail.subject, html: mail.html, text: mail.text,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await saveVoix(v); console.error("resend", r.status, j); return res.status(502).json({ error: "L'email n'est pas parti (" + (j.message || r.status) + "). Le lien reste disponible dans « Espace client ».", url }); }
    v.invite = { to, sentAt: Date.now(), by: req.user?.nom || req.user?.email || "", id: j.id || "" };
    await saveVoix(v);
    return res.status(200).json({ ok: true, to, url, sentAt: v.invite.sentAt, depotToken: v.depotToken });
  } catch (e) {
    console.error("invite", e);
    return res.status(502).json({ error: "Envoi impossible pour le moment." });
  }
}
