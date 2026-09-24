import crypto from "node:crypto";
import { token, isAuthed } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(isAuthed(req) ? 200 : 401).json({ ok: isAuthed(req) });
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "studio_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    return res.status(200).json({ ok: true });
  }
  if (req.method !== "POST") return res.status(405).end();
  const expected = process.env.APP_PASSWORD || "";
  const given = String(req.body?.password || "");
  const ok = expected && given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) { await new Promise(r => setTimeout(r, 800)); return res.status(401).json({ error: "bad_password" }); }
  res.setHeader("Set-Cookie", `studio_auth=${token()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
  res.status(200).json({ ok: true });
}
