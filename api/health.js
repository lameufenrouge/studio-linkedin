import { supaBase, supaHeaders } from "./_supa.js";

// Diagnostic : ouvre /api/health dans le navigateur. N'affiche jamais les clés.
export default async function handler(req, res) {
  const out = {
    SUPABASE_URL: supaBase() || "MANQUANTE",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "présente" : "MANQUANTE",
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? "présente" : "absente",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "présente" : "absente",
    MODEL_COMPLEX: process.env.MODEL_COMPLEX || "(défaut)",
    MODEL_DEFAULT: process.env.MODEL_DEFAULT || "(défaut)",
    mot_de_passe: process.env.APP_PASSWORD ? "activé" : "désactivé",
  };
  if (supaBase() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const r = await fetch(`${supaBase()}/rest/v1/studio_docs?select=id&limit=1`, { headers: supaHeaders() });
      out.test_supabase = r.ok ? "OK, la table répond" : `ERREUR ${r.status} : ${(await r.text()).slice(0, 200)}`;
    } catch (e) { out.test_supabase = "Supabase injoignable : " + (e.cause?.code || e.message); }
  }
  res.status(200).json(out);
}
