import crypto from "node:crypto";
import { supaBase, supaHeaders } from "./_supa.js";

// ---- IA (intégrée ici pour que ce fichier soit autonome) ----
const useOR = !!process.env.OPENROUTER_API_KEY;
const MODELS = useOR
  ? { complex: process.env.MODEL_COMPLEX || "anthropic/claude-opus-5.5", default: process.env.MODEL_DEFAULT || "anthropic/claude-sonnet-5", audio: process.env.MODEL_AUDIO || "google/gemini-2.5-flash" }
  : { complex: process.env.MODEL_COMPLEX || "claude-opus-5-5", default: process.env.MODEL_DEFAULT || "claude-sonnet-5" };

function part(p) {
  if (p.type === "image") return useOR
    ? { type: "image_url", image_url: { url: `data:${p.media_type};base64,${p.data}` } }
    : { type: "image", source: { type: "base64", media_type: p.media_type, data: p.data } };
  if (p.type === "audio") return { type: "input_audio", input_audio: { data: p.data, format: p.format } };
  return p;
}

async function complete(input, tier = "default") {
  if (tier === "audio" && !useOR) throw new Error("audio_unsupported");
  const content = typeof input === "string" ? input : input.map(part);
  const model = MODELS[tier] || MODELS.default;
  const r = useOR
    ? await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "X-Title": "signe studio" },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content }] }),
      })
    : await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content }] }),
      });
  if (!r.ok) throw new Error("ia_" + r.status);
  const j = await r.json();
  return useOR ? String(j.choices?.[0]?.message?.content || "") : (j.content || []).map(x => x.text || "").join("");
}

function extractPrompt(nom, kind, text) {
  return `Tu prépares la matière première d'un ghostwriter LinkedIn pour ${nom}. Voici une source de type « ${kind} », envoyée directement par ${nom}.
Extrais UNIQUEMENT ce qui y est réellement dit, sans rien inventer, sans extrapoler, en français. Garde les détails exacts : dates, montants, durées, prénoms, lieux, noms d'entreprises.

Réponds en texte brut avec ces rubriques (omets celles qui sont vides) :
FAITS ET VÉCU
- 
CHIFFRES
- 
CONVICTIONS ET PRISES DE POSITION
- 
ACTUALITÉ ET PROJETS
- 
VERBATIM
- « phrases exactes, utiles pour sa façon de parler »
IDÉES DE POSTS
- 

${text ? `SOURCE :\n<<<\n${text.slice(0, 120000)}\n>>>` : ""}`;
}

const PHOTO_PROMPT = "Décris cette photo pour une banque d'images LinkedIn, en français. Réponds UNIQUEMENT en JSON : {\"description\":\"1 phrase factuelle : qui, quoi, où, ambiance\",\"tags\":[\"3 à 6 mots-clés courts\"]}. N'invente pas l'identité des personnes.";
function parsePhotoMeta(t) {
  try { const s = t.replace(/```json|```/g, ""); const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); return { description: String(j.description || ""), tags: Array.isArray(j.tags) ? j.tags.slice(0, 6).map(String) : [] }; }
  catch { return { description: "", tags: [] }; }
}

// Envoi d'image (bucket privé Supabase)
const BUCKET = process.env.SUPABASE_BUCKET || "studio-images";
const HS = () => { const h = supaHeaders(); return { apikey: h.apikey, Authorization: h.Authorization }; };
async function uploadImage(voixId, data64, mime) {
  const id = crypto.randomUUID();
  const path = `${voixId}/${id}.jpg`;
  const up = await fetch(`${supaBase()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", headers: { ...HS(), "Content-Type": mime || "image/jpeg", "x-upsert": "true" },
    body: Buffer.from(data64, "base64"),
  });
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    throw new Error(/bucket not found/i.test(t) ? "Le stockage des photos n'est pas encore activé." : "Envoi de la photo impossible.");
  }
  return { id, path };
}
function saveImageDoc(id, data) {
  return fetch(`${supaBase()}/rest/v1/studio_docs?on_conflict=collection,id`, {
    method: "POST", headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "images", id, data, updated_at: Date.now() }),
  });
}

// Page de dépôt client : accès par lien secret, sans mot de passe, limité à UN client.
const docs = () => `${supaBase()}/rest/v1/studio_docs`;

async function findClient(token) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token || "")) return null;
  const r = await fetch(`${docs()}?collection=eq.voix&data->>depotToken=eq.${encodeURIComponent(token)}&select=id,data&limit=1`, { headers: supaHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? { id: rows[0].id, ...rows[0].data } : null;
}
async function listDocs(col, voixId, extra = "") {
  const r = await fetch(`${docs()}?collection=eq.${col}&data->>voixId=eq.${encodeURIComponent(voixId)}${extra}&select=id,data&order=updated_at.desc&limit=100`, { headers: supaHeaders() });
  if (!r.ok) return [];
  return (await r.json()).map(x => ({ id: x.id, ...x.data }));
}
async function getDoc(col, id) {
  const r = await fetch(`${docs()}?collection=eq.${col}&id=eq.${encodeURIComponent(id)}&select=id,data&limit=1`, { headers: supaHeaders() });
  if (!r.ok) return null;
  const x = (await r.json())[0]; return x ? { id: x.id, ...x.data } : null;
}
async function putDoc(col, id, data) {
  const body = { ...data, updatedAt: Date.now() }; delete body.id;
  const r = await fetch(`${docs()}?on_conflict=collection,id`, {
    method: "POST", headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: col, id, data: body, updated_at: Date.now() }),
  });
  if (!r.ok) throw new Error("save");
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
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Le dépôt n'est pas configuré (variables Supabase manquantes)." });
  const c = await findClient(token).catch(() => null);
  if (!c) return res.status(404).json({ error: "Ce lien n'est plus valide. Demandez-en un nouveau à votre contact signé." });
  const prenom = String(c.nom || "").split(/\s+/)[0];

  if (req.method === "GET") {
    // Uniquement ce qui concerne CE client, et seulement les champs utiles à la validation
    const [plans, posts] = await Promise.all([listDocs("plannings", c.id), listDocs("posts", c.id, "&data->>partage=eq.true")]);
    return res.status(200).json({
      prenom,
      plannings: plans.filter(p => (p.slots || []).length).map(p => ({ id: p.id, titre: p.titre || "Planning", slots: p.slots.map((s, i) => ({ i, date: s.date, objectif: s.objectif || "", sujet: s.sujet || "", accroche: s.accroche || "", statut: s.statut || "attente", retour: s.retour || "" })) })),
      posts: posts.map(p => ({ id: p.id, sujet: p.sujet || "", texte: p.texte || "", validation: p.validation || "attente", clientComment: p.clientComment || "", sharedAt: p.sharedAt || p.updatedAt || 0 })).sort((a, b) => b.sharedAt - a.sharedAt),
    });
  }
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
    if (b.action === "slot" || b.action === "plan-all") {
      const plan = await getDoc("plannings", String(b.planId || ""));
      if (!plan || plan.voixId !== c.id) return res.status(404).json({ error: "Planning introuvable." });
      const now = Date.now();
      if (b.action === "plan-all") plan.slots.forEach(s => { if ((s.statut || "attente") === "attente") Object.assign(s, { statut: "valide", parClient: true, clientAt: now }); });
      else {
        const s = plan.slots[+b.i]; if (!s) return res.status(404).json({ error: "Sujet introuvable." });
        Object.assign(s, { statut: b.statut === "revoir" ? "revoir" : b.statut === "attente" ? "attente" : "valide", retour: String(b.retour ?? s.retour ?? "").slice(0, 2000), parClient: true, clientAt: now });
      }
      await putDoc("plannings", plan.id, plan);
      return res.status(200).json({ ok: true });
    }
    if (b.action === "post") {
      const post = await getDoc("posts", String(b.postId || ""));
      if (!post || post.voixId !== c.id || !post.partage) return res.status(404).json({ error: "Post introuvable." });
      Object.assign(post, { validation: b.validation === "revoir" ? "revoir" : "valide", clientComment: String(b.comment || "").slice(0, 3000), clientAt: Date.now() });
      await putDoc("posts", post.id, post);
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
    return res.status(502).json({ error: e.message === "audio_unsupported" ? "Les vocaux ne sont pas activés : écrivez ou dictez votre message." : /photo|stockage/i.test(e.message) ? e.message : "L'envoi n'a pas marché, réessayez dans un instant." });
  }
}
