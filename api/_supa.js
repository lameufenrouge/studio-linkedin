// Accepte l'URL Supabase avec ou sans "/rest/v1/" à la fin
export const supaBase = () =>
  String(process.env.SUPABASE_URL || "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
export const supaHeaders = () => {
  const k = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
};
