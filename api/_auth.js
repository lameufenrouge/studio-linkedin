import crypto from "node:crypto";

// Sans variable APP_PASSWORD dans Vercel : accès direct, sans mot de passe.
export const passwordOn = () => !!process.env.APP_PASSWORD;

export function token() {
  const secret = process.env.AUTH_SECRET || "studio";
  return crypto.createHmac("sha256", secret).update("studio:" + (process.env.APP_PASSWORD || "")).digest("hex");
}

export function isAuthed(req) {
  if (!passwordOn()) return true;
  const raw = req.headers.cookie || "";
  const m = raw.match(/(?:^|;\s*)studio_auth=([a-f0-9]+)/);
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(token());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}
