import crypto from "node:crypto";
import { requireAuth } from "./_auth.js";
import { supaBase, supaHeaders } from "./_supa.js";

// Envoie au client le lien de son espace, depuis hello@agencesigne.com (via Resend)
const FROM = () => process.env.MAIL_FROM || "signé. <hello@agencesigne.com>";
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
function mailHtml(prenom, url) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F1EFFF;font-family:Helvetica,Arial,sans-serif;color:#16134A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFFF;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#16134A;padding:28px 32px;color:#F1EFFF">
<div style="font-size:26px;font-weight:800;letter-spacing:-1px">signé<span style="color:#3B4BFF">.</span></div>
<div style="font-size:28px;font-weight:800;margin-top:18px;letter-spacing:-.5px">Bonjour ${esc(prenom)},</div>
<div style="font-family:Georgia,serif;font-style:italic;font-size:18px;margin-top:8px;color:#D9D5FF">Votre espace est prêt.</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:16px;line-height:1.6">
<p style="margin:0 0 14px">Voici votre espace personnel signé. Vous y retrouverez vos posts et votre planning à valider, et vous pourrez nous envoyer à tout moment une anecdote, un chiffre, un document, un vocal ou vos photos.</p>
<p style="margin:0 0 22px">Il s'ouvre depuis votre téléphone ou votre ordinateur, sans créer de compte. Gardez-le en favori : c'est toujours le même lien.</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#3B4BFF;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Ouvrir mon espace</a></p>
<p style="margin:0;font-size:13px;color:#5E5B85">Si le bouton ne marche pas, copiez ce lien : <br><a href="${esc(url)}" style="color:#3B4BFF;word-break:break-all">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:0 32px 28px;font-size:13px;color:#5E5B85">Une question ? Répondez simplement à cet email.<br>L'équipe signé.</td></tr>
</table></td></tr></table></body></html>`;
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
    if (!process.env.RESEND_API_KEY) { await saveVoix(v); return res.status(503).json({ error: "L'envoi automatique n'est pas encore branché (clé Resend manquante dans Vercel). Le lien est prêt : copie-le depuis « Espace client ».", url }); }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM(), to: [to], reply_to: REPLY(),
        subject: "Votre espace signé. est prêt",
        html: mailHtml(prenom, url),
        text: `Bonjour ${prenom},\n\nVoici votre espace personnel signé. : ${url}\n\nVous y retrouverez vos posts et votre planning à valider, et vous pourrez nous envoyer à tout moment une anecdote, un chiffre, un document, un vocal ou vos photos. Sans créer de compte : gardez ce lien en favori.\n\nUne question ? Répondez simplement à cet email.\nL'équipe signé.`,
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
