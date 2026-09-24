# Studio LinkedIn — version Vercel

## Ce qu'il te faut
- Un compte Vercel et un compte GitHub (les mêmes que pour Tournée)
- Un projet Supabase (un nouveau, ou celui de Tournée)
- Une clé API Anthropic : https://console.anthropic.com (facturée à l'usage, séparément de ton abonnement Claude)

## Mise en route
1. **Supabase** : SQL Editor > colle le contenu de `supabase.sql` > Run.
   Puis Project Settings > API : note l'URL du projet et la clé `service_role` (pas la clé anon).
2. **GitHub** : crée un dépôt privé `studio-linkedin` et dépose tous les fichiers de ce dossier.
3. **Vercel** : Add New > Project > importe le dépôt. Framework : Other. Ne change rien d'autre.
4. Avant de cliquer sur Deploy, ajoute les variables d'environnement (voir `.env.example`) :
   - `ANTHROPIC_API_KEY` : ta clé Anthropic
   - `APP_PASSWORD` : le mot de passe pour entrer dans l'app
   - `AUTH_SECRET` : une longue chaîne aléatoire (au moins 32 caractères)
   - `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
5. Deploy. Ouvre l'URL, entre le mot de passe, c'est prêt.

## Modèles utilisés
- Qualité maximale : `claude-opus-5-5`
- Standard (idées, plannings, analyses) : `claude-sonnet-5`
Modifiables avec `MODEL_COMPLEX`, `MODEL_DEFAULT`, `MODEL_QUICK`.

## Si un post plante au bout d'un moment
`vercel.json` autorise 300 secondes par génération. Si Vercel refuse ce réglage
à cause de ton offre, remplace 300 par 60.

## Important
Les données du Studio sur claude.ai ne sont pas transférées : sur Vercel tu repars
d'une base vide (voix, modèles perso, historique). Les 12 modèles intégrés sont là.
