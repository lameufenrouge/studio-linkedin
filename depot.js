import crypto from "node:crypto";
import { supaBase, supaHeaders } from "./_supa.js";
import { complete, extractPrompt, PHOTO_PROMPT, parsePhotoMeta } from "./_llm.js";
import { uploadImage, saveDoc as saveImageDoc } from "./images.js";

// Page de dépôt client : accès par lien secret, sans mot de passe, limité à UN client.
const docs = () => `${supaBase()}/rest/v1/studio_docs`;

async function findClient(token) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token || "")) return null;
  const r = await fetch(`${docs()}?collection=eq.voix&data->>depotToken=eq.${encodeURIComponent(token)}&select=id,data&limit=1`, { headers: supaHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? { id: rows[0].id, ...rows[0].data } : null;
}
async function saveSource(data) {
  const id = crypto.randomUUID();
  const r = await fetch(`${docs()}?on_conflict=collection,id`, {
    method: "POST", headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "sources", id, data, updated_at: Date.now() }),
  });
  if (!r.ok) throw new Error("save");
  return id;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.query.t || req.body?.t || "");
  const c = await findClient(token).catch(() => null);
  if (!c) return res.status(404).json({ error: "Ce lien n'est plus valide. Demandez-en un nouveau à votre contact signé." });
  const prenom = String(c.nom || "").split(/\s+/)[0];

  if (req.method === "GET") return res.status(200).json({ prenom });
  if (req.method !== "POST") return res.status(405).end();

  const b = req.body || {};
  try {
    if (b.action === "photo") {
      if (!b.data64 || b.data64.length > 4_000_000) return res.status(400).json({ error: "Photo trop lourde" });
      let meta = { description: "", tags: [] };
      try { meta = parsePhotoMeta(await complete([{ type: "text", text: PHOTO_PROMPT }, { type: "image", media_type: "image/jpeg", data: b.small64 || b.data64 }])); } catch {}
      const { id, path } = await uploadImage(c.id, b.data64, "image/jpeg");
      const r = await saveImageDoc(id, { voixId: c.id, path, nom: String(b.nom || "").slice(0, 120), ...meta, width: b.width || 0, height: b.height || 0, createdAt: Date.now(), origine: "client" });
      if (!r.ok) throw new Error("save");
      return res.status(200).json({ ok: true });
    }
    if (b.action === "info") {
      const type = ["texte", "vocal", "doc", "lien", "capture", "transcript"].includes(b.type) ? b.type : "texte";
      const label = { texte: "message", vocal: "vocal", doc: "document", lien: "lien", capture: "captures d'écran", transcript: "transcription" }[type];
      let raw = String(b.texte || "").slice(0, 150000), faits = "";
      if (b.audio?.data) {
        if (b.audio.data.length > 4_800_000) return res.status(400).json({ error: "Vocal trop long (3 minutes maximum)" });
        raw = (await complete([{ type: "text", text: "Transcris fidèlement ce vocal en français, mot pour mot, sans résumer ni commenter. Réponds uniquement avec la transcription." }, { type: "audio", format: b.audio.format || "mp3", data: b.audio.data }], "audio")).trim();
      }
      if (Array.isArray(b.images) && b.images.length) {
        faits = (await complete([{ type: "text", text: extractPrompt(c.nom, label, "") + "\nLa source, ce sont les images jointes. Lis tout le texte visible." }, ...b.images.slice(0, 4).map(d => ({ type: "image", media_type: "image/jpeg", data: d }))])).trim();
        raw = raw || "(captures d'écran)";
      }
      if (!faits) {
        if (raw.trim().length < 3) return res.status(400).json({ error: "Le message est vide." });
        faits = raw.length < 600 ? raw.trim() : ((await complete(extractPrompt(c.nom, label, raw))).trim() || raw.slice(0, 8000));
      }
      const titre = String(b.titre || "").trim().slice(0, 140) || `${label.charAt(0).toUpperCase() + label.slice(1)} de ${prenom} · ${new Date().toLocaleDateString("fr-FR")}`;
      await saveSource({ voixId: c.id, type, titre, faits, extrait: raw.slice(0, 20000), createdAt: Date.now(), origine: "client" });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Demande inconnue" });
  } catch (e) {
    console.error("depot", e);
    return res.status(502).json({ error: e.message === "audio_unsupported" ? "Les vocaux ne sont pas activés : écrivez ou dictez votre message." : "L'envoi n'a pas marché, réessayez dans un instant." });
  }
}
