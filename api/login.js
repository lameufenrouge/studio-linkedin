import crypto from "node:crypto";
import { findUsers, saveUser, hashPassword, checkPassword, sessionCookie, clearCookie, getUser, publicUser } from "./_auth.js";

const slow = () => new Promise(r => setTimeout(r, 700));
const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.AUTH_SECRET) return res.status(500).json({ error: "Variable AUTH_SECRET manquante dans Vercel" });
  try {
    if (req.method === "GET") {
      const u = await getUser(req);
      if (u) return res.status(200).json({ user: publicUser(u) });
      const setup = (await findUsers()).length === 0;
      return res.status(401).json({ setup });
    }
    if (req.method === "DELETE") { res.setHeader("Set-Cookie", clearCookie()); return res.status(200).json({ ok: true }); }
    if (req.method !== "POST") return res.status(405).end();
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");

    if (b.action === "setup") {
      if ((await findUsers()).length) return res.status(409).json({ error: "Un compte existe déjà : connecte-toi." });
      const code = String(b.code || "").trim(), secret = String(process.env.AUTH_SECRET);
      if (code.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(code), Buffer.from(secret))) { await slow(); return res.status(403).json({ error: "Code d'installation incorrect." }); }
      if (!okEmail(email)) return res.status(400).json({ error: "Email invalide." });
      if (password.length < 8) return res.status(400).json({ error: "Mot de passe : 8 caractères minimum." });
      const id = crypto.randomUUID(), user = { email, nom: String(b.nom || "").trim(), role: "admin", ...hashPassword(password), v: 0, createdAt: Date.now() };
      await saveUser(id, user);
      res.setHeader("Set-Cookie", sessionCookie({ id, ...user }));
      return res.status(200).json({ user: publicUser({ id, ...user }) });
    }

    const u = (await findUsers(`&data->>email=eq.${encodeURIComponent(email)}`))[0];
    if (!u || !checkPassword(password, u)) { await slow(); return res.status(401).json({ error: "Email ou mot de passe incorrect." }); }
    res.setHeader("Set-Cookie", sessionCookie(u));
    return res.status(200).json({ user: publicUser(u) });
  } catch (e) {
    console.error("login", e);
    return res.status(502).json({ error: "Connexion impossible pour le moment (base de données)." });
  }
}
