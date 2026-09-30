import crypto from "node:crypto";
import { supaBase, supaHeaders } from "./_supa.js";

// Comptes : studio_docs, collection "users" (jamais lisible depuis le navigateur)
const SECRET = () => String(process.env.AUTH_SECRET || "");
const DAYS = 90;
const b64u = s => Buffer.from(s).toString("base64url");
const hmac = s => crypto.createHmac("sha256", SECRET()).update(s).digest("base64url");

export function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString("hex") };
}
export function checkPassword(pw, user) {
  if (!user?.salt || !user?.hash) return false;
  const a = Buffer.from(crypto.scryptSync(String(pw), user.salt, 64).toString("hex")), b = Buffer.from(user.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const docs = () => `${supaBase()}/rest/v1/studio_docs`;
export async function findUsers(filter = "") {
  const r = await fetch(`${docs()}?collection=eq.users${filter}&select=id,data&limit=200`, { headers: supaHeaders() });
  if (!r.ok) throw new Error("db");
  return (await r.json()).map(x => ({ id: x.id, ...x.data }));
}
export async function saveUser(id, data) {
  const r = await fetch(`${docs()}?on_conflict=collection,id`, {
    method: "POST", headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ collection: "users", id, data, updated_at: Date.now() }),
  });
  if (!r.ok) throw new Error("db");
}
export async function deleteUser(id) {
  await fetch(`${docs()}?collection=eq.users&id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: supaHeaders() });
  cache.delete(id);
}
export const publicUser = u => ({ id: u.id, email: u.email, nom: u.nom || "", role: u.role || "ghostwriter" });

export function sessionCookie(user) {
  const payload = b64u(JSON.stringify({ uid: user.id, v: user.v || 0, exp: Date.now() + DAYS * 864e5 }));
  return `studio_session=${payload}.${hmac(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
export const clearCookie = () => "studio_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

const cache = new Map();
export async function getUser(req) {
  if (!SECRET()) return null;
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)studio_session=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const sig = hmac(m[1]);
  if (sig.length !== m[2].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(m[2]))) return null;
  let p; try { p = JSON.parse(Buffer.from(m[1], "base64url").toString()); } catch { return null; }
  if (!p.uid || p.exp < Date.now()) return null;
  const c = cache.get(p.uid);
  let u = c && Date.now() - c.t < 30000 ? c.u : null;
  if (!u) { u = (await findUsers(`&id=eq.${encodeURIComponent(p.uid)}`).catch(() => []))[0] || null; cache.set(p.uid, { u, t: Date.now() }); }
  if (!u || (u.v || 0) !== (p.v || 0)) return null;
  return u;
}
export async function requireAuth(req, res, role) {
  const u = await getUser(req);
  if (!u) { res.status(401).json({ error: "unauthorized" }); return null; }
  if (role === "admin" && u.role !== "admin") { res.status(403).json({ error: "Réservé aux admins" }); return null; }
  req.user = u;
  return u;
}
