import { requireAuth } from "./_auth.js";
import { supaBase, supaHeaders } from "./_supa.js";

const COLLECTIONS = new Set(["voix", "posts", "modeles", "idees", "plannings"]);

async function fail(res, r, where) {
  const detail = r ? (await r.text().catch(() => "")).slice(0, 300) : where;
  console.error("Supabase", where, r?.status, detail);
  return res.status(502).json({ error: "db_error", status: r?.status || 0, detail });
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "db_error", detail: "Variables SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes dans Vercel" });
  const col = String(req.query.collection || req.body?.collection || "");
  if (!COLLECTIONS.has(col)) return res.status(400).json({ error: "db_error", detail: "collection inconnue" });
  const base = `${supaBase()}/rest/v1/studio_docs`;
  try {
    if (req.method === "GET") {
      const r = await fetch(`${base}?collection=eq.${col}&select=id,data&order=updated_at.desc&limit=300`, { headers: supaHeaders() });
      if (!r.ok) return fail(res, r, "lecture");
      const rows = await r.json();
      return res.status(200).json(rows.map(x => ({ id: x.id, ...x.data })));
    }
    if (req.method === "POST") {
      const { id, data } = req.body || {};
      if (!id || !data || typeof data !== "object") return res.status(400).json({ error: "db_error", detail: "données invalides" });
      const r = await fetch(`${base}?on_conflict=collection,id`, {
        method: "POST",
        headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ collection: col, id: String(id), data, updated_at: Number(data.updatedAt) || Date.now() }),
      });
      if (!r.ok) return fail(res, r, "écriture");
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      const r = await fetch(`${base}?collection=eq.${col}&id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: supaHeaders() });
      if (!r.ok) return fail(res, r, "suppression");
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error("Supabase injoignable", e);
    return res.status(502).json({ error: "db_error", detail: "Supabase injoignable : vérifie SUPABASE_URL (" + (e.cause?.code || e.message) + ")" });
  }
}
