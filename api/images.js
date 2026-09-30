import crypto from "node:crypto";
import { requireAuth } from "./_auth.js";
import { supaBase, supaHeaders } from "./_supa.js";

// Banque d'images : fichiers dans Supabase Storage (bucket privé), fiches dans studio_docs (collection "images")
const BUCKET = process.env.SUPABASE_BUCKET || "studio-images";
const docs = () => `${supaBase()}/rest/v1/studio_docs`;
const H = () => { const h = supaHeaders(); return { apikey: h.apikey, Authorization: h.Authorization }; };

export async function sign(paths) {
  if (!paths.length) return {};
  const r = await fetch(`${supaBase()}/storage/v1/object/sign/${BUCKET}`, {
    method: "POST", headers: { ...H(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 * 60 * 6, paths }),
  });
  if (!r.ok) return {};
  const out = {};
  for (const x of await r.json()) if (x.signedURL) out[x.path] = `${supaBase()}/storage/v1${x.signedURL}`;
  return out;
}
export async function saveDoc(id, data) {
  return fetch(`${docs()}?on_conflict=collection,id`, {
    method: "POST", headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "images", id, data, updated_at: Date.now() }),
  });
}

export async function uploadImage(voixId, data64, mime) {
  const id = crypto.randomUUID();
  const path = `${voixId}/${id}.jpg`;
  const up = await fetch(`${supaBase()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST", headers: { ...H(), "Content-Type": mime || "image/jpeg", "x-upsert": "true" },
    body: Buffer.from(data64, "base64"),
  });
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    throw new Error(/bucket not found/i.test(t) ? "Le bucket « studio-images » n'existe pas dans Supabase (voir le SQL à exécuter)" : "Envoi de l'image impossible : " + t.slice(0, 160));
  }
  return { id, path };
}

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Variables Supabase manquantes" });
  try {
    if (req.method === "GET") {
      const v = String(req.query.voixId || "");
      const q = `${docs()}?collection=eq.images${v ? `&data->>voixId=eq.${encodeURIComponent(v)}` : ""}&select=id,data&order=updated_at.desc&limit=500`;
      const r = await fetch(q, { headers: supaHeaders() });
      if (!r.ok) return res.status(502).json({ error: "Lecture impossible" });
      const rows = (await r.json()).map(x => ({ id: x.id, ...x.data }));
      const urls = await sign(rows.map(x => x.path).filter(Boolean));
      return res.status(200).json(rows.map(x => ({ ...x, url: urls[x.path] || null })));
    }
    if (req.method === "POST") {
      const b = req.body || {};
      if (b.id && !b.data64) { // mise à jour de la fiche (légende, mots-clés)
        const { id, url, ...data } = b;
        const r = await saveDoc(id, data);
        return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
      }
      if (!b.voixId || !b.data64) return res.status(400).json({ error: "Image manquante" });
      let id, path;
      try { ({ id, path } = await uploadImage(b.voixId, b.data64, b.mime)); } catch (e) { return res.status(502).json({ error: e.message }); }
      const data = { voixId: b.voixId, path, nom: b.nom || "", description: b.description || "", tags: b.tags || [], width: b.width || 0, height: b.height || 0, createdAt: Date.now() };
      const r = await saveDoc(id, data);
      if (!r.ok) return res.status(502).json({ error: "Image envoyée mais fiche non enregistrée" });
      const urls = await sign([path]);
      return res.status(200).json({ id, ...data, url: urls[path] || null });
    }
    if (req.method === "DELETE") {
      const id = String(req.query.id || ""), path = String(req.query.path || "");
      if (path) await fetch(`${supaBase()}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { ...H(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }) });
      const r = await fetch(`${docs()}?collection=eq.images&id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: supaHeaders() });
      return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
    }
    res.status(405).end();
  } catch (e) {
    res.status(502).json({ error: "Supabase injoignable (" + (e.cause?.code || e.message) + ")" });
  }
}
