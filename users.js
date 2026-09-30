import crypto from "node:crypto";
import { requireAuth, findUsers, saveUser, deleteUser, hashPassword, checkPassword, publicUser, sessionCookie } from "./_auth.js";

const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const me = await requireAuth(req, res); if (!me) return;
  try {
    const b = req.body || {};
    // Changer son propre mot de passe (tout le monde)
    if (req.method === "POST" && b.action === "password" && (!b.id || b.id === me.id)) {
      if (!checkPassword(String(b.current || ""), me)) return res.status(403).json({ error: "Mot de passe actuel incorrect." });
      if (String(b.password || "").length < 8) return res.status(400).json({ error: "8 caractères minimum." });
      const u = { ...me, ...hashPassword(b.password), v: (me.v || 0) + 1 }; delete u.id;
      await saveUser(me.id, u);
      res.setHeader("Set-Cookie", sessionCookie({ id: me.id, ...u }));
      return res.status(200).json({ ok: true });
    }
    // Tout le reste : admins uniquement
    if (me.role !== "admin") return res.status(403).json({ error: "Réservé aux admins." });
    if (req.method === "GET") return res.status(200).json((await findUsers()).map(publicUser).sort((a, b) => a.email.localeCompare(b.email)));
    if (req.method === "POST" && b.action === "create") {
      const email = String(b.email || "").trim().toLowerCase();
      if (!okEmail(email)) return res.status(400).json({ error: "Email invalide." });
      if (String(b.password || "").length < 8) return res.status(400).json({ error: "Mot de passe : 8 caractères minimum." });
      if ((await findUsers(`&data->>email=eq.${encodeURIComponent(email)}`)).length) return res.status(409).json({ error: "Cet email a déjà un compte." });
      const id = crypto.randomUUID();
      await saveUser(id, { email, nom: String(b.nom || "").trim(), role: b.role === "admin" ? "admin" : "ghostwriter", ...hashPassword(b.password), v: 0, createdAt: Date.now() });
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && b.action === "password" && b.id) {
      if (String(b.password || "").length < 8) return res.status(400).json({ error: "8 caractères minimum." });
      const u = (await findUsers(`&id=eq.${encodeURIComponent(b.id)}`))[0]; if (!u) return res.status(404).json({ error: "Compte introuvable." });
      const data = { ...u, ...hashPassword(b.password), v: (u.v || 0) + 1 }; delete data.id;
      await saveUser(u.id, data);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && b.action === "role" && b.id) {
      if (b.id === me.id) return res.status(400).json({ error: "Tu ne peux pas changer ton propre rôle." });
      const u = (await findUsers(`&id=eq.${encodeURIComponent(b.id)}`))[0]; if (!u) return res.status(404).json({ error: "Compte introuvable." });
      const data = { ...u, role: b.role === "admin" ? "admin" : "ghostwriter" }; delete data.id;
      await saveUser(u.id, data);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (id === me.id) return res.status(400).json({ error: "Tu ne peux pas supprimer ton propre compte." });
      await deleteUser(id);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Demande inconnue" });
  } catch (e) {
    console.error("users", e);
    res.status(502).json({ error: "Base de données indisponible." });
  }
}
