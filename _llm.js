// Appel IA non streamé, côté serveur (utilisé par la page de dépôt client)
const useOR = !!process.env.OPENROUTER_API_KEY;
const MODELS = useOR
  ? { complex: process.env.MODEL_COMPLEX || "anthropic/claude-opus-5.5", default: process.env.MODEL_DEFAULT || "anthropic/claude-sonnet-5", audio: process.env.MODEL_AUDIO || "google/gemini-2.5-flash" }
  : { complex: process.env.MODEL_COMPLEX || "claude-opus-5-5", default: process.env.MODEL_DEFAULT || "claude-sonnet-5" };

function part(p) {
  if (p.type === "image") return useOR
    ? { type: "image_url", image_url: { url: `data:${p.media_type};base64,${p.data}` } }
    : { type: "image", source: { type: "base64", media_type: p.media_type, data: p.data } };
  if (p.type === "audio") return { type: "input_audio", input_audio: { data: p.data, format: p.format } };
  return p;
}

export async function complete(input, tier = "default") {
  if (tier === "audio" && !useOR) throw new Error("audio_unsupported");
  const content = typeof input === "string" ? input : input.map(part);
  const model = MODELS[tier] || MODELS.default;
  const r = useOR
    ? await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "X-Title": "signe studio" },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content }] }),
      })
    : await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content }] }),
      });
  if (!r.ok) throw new Error("ia_" + r.status);
  const j = await r.json();
  return useOR ? String(j.choices?.[0]?.message?.content || "") : (j.content || []).map(x => x.text || "").join("");
}

export function extractPrompt(nom, kind, text) {
  return `Tu prépares la matière première d'un ghostwriter LinkedIn pour ${nom}. Voici une source de type « ${kind} », envoyée directement par ${nom}.
Extrais UNIQUEMENT ce qui y est réellement dit, sans rien inventer, sans extrapoler, en français. Garde les détails exacts : dates, montants, durées, prénoms, lieux, noms d'entreprises.

Réponds en texte brut avec ces rubriques (omets celles qui sont vides) :
FAITS ET VÉCU
- 
CHIFFRES
- 
CONVICTIONS ET PRISES DE POSITION
- 
ACTUALITÉ ET PROJETS
- 
VERBATIM
- « phrases exactes, utiles pour sa façon de parler »
IDÉES DE POSTS
- 

${text ? `SOURCE :\n<<<\n${text.slice(0, 120000)}\n>>>` : ""}`;
}

export const PHOTO_PROMPT = "Décris cette photo pour une banque d'images LinkedIn, en français. Réponds UNIQUEMENT en JSON : {\"description\":\"1 phrase factuelle : qui, quoi, où, ambiance\",\"tags\":[\"3 à 6 mots-clés courts\"]}. N'invente pas l'identité des personnes.";
export function parsePhotoMeta(t) {
  try { const s = t.replace(/```json|```/g, ""); const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); return { description: String(j.description || ""), tags: Array.isArray(j.tags) ? j.tags.slice(0, 6).map(String) : [] }; }
  catch { return { description: "", tags: [] }; }
}
