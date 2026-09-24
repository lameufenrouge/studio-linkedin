import { requireAuth } from "./_auth.js";

const COLLECTIONS = new Set(["voix", "posts", "modeles", "idees", "plannings"]);
const base = () => `${process.env.SUPABASE_URL}/rest/v1/studio_docs`;
const headers = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const col = String(req.query.collection || req.body?.collection || "");
  if (!COLLECTIONS.has(col)) return res.status(400).json({ error: "bad_collection" });

  if (req.method === "GET") {
    const r = await fetch(`${base()}?collection=eq.${col}&select=id,data&order=updated_at.desc&limit=300`, { headers: headers() });
    if (!r.ok) return res.status(502).json({ error: "db_error" });
    const rows = await r.json();
    return res.status(200).json(rows.map(x => ({ id: x.id, ...x.data })));
  }
  if (req.method === "POST") {
    const { id, data } = req.body || {};
    if (!id || typeof data !== "object") return res.status(400).json({ error: "bad_body" });
    const r = await fetch(`${base()}?on_conflict=collection,id`, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ collection: col, id: String(id), data, updated_at: Number(data.updatedAt) || Date.now() }),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }
  if (req.method === "DELETE") {
    const id = String(req.query.id || "");
    const r = await fetch(`${base()}?collection=eq.${col}&id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }
  res.status(405).end();
}
