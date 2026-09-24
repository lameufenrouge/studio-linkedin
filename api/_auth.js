import crypto from "node:crypto";

export function token() {
  const secret = process.env.AUTH_SECRET || "";
  const pwd = process.env.APP_PASSWORD || "";
  return crypto.createHmac("sha256", secret).update("studio:" + pwd).digest("hex");
}

export function isAuthed(req) {
  const raw = req.headers.cookie || "";
  const m = raw.match(/(?:^|;\s*)studio_auth=([a-f0-9]+)/);
  if (!m || !process.env.APP_PASSWORD || !process.env.AUTH_SECRET) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(token());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}
