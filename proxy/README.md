# Proxy FitPilot (facultatif)

Gemini et Groq acceptent les appels directement depuis le navigateur. **Ce proxy n'est donc pas obligatoire.**
Il sert seulement à **garder ta clé API hors du téléphone** : elle est stockée comme secret chez Cloudflare (offre gratuite : 100 000 requêtes par jour).

## Déploiement (10 minutes, gratuit)

1. Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. Sur ton ordinateur, dans ce dossier `proxy/` :
   ```bash
   npx wrangler login
   ```
3. Ouvre `wrangler.toml` et remplace `ALLOWED_ORIGIN` par l'adresse exacte de ton app, par exemple `https://ton-pseudo.github.io`. Seule cette origine pourra utiliser le proxy.
4. Enregistre ta ou tes clés comme secrets (elles ne sont jamais écrites dans un fichier) :
   ```bash
   npx wrangler secret put GROQ_API_KEY
   npx wrangler secret put GEMINI_API_KEY
   ```
5. Déploie :
   ```bash
   npx wrangler deploy
   ```
   Wrangler affiche une adresse comme `https://fitpilot-proxy.ton-compte.workers.dev`.
6. Dans FitPilot, va dans **Paramètres → Coach IA** : choisis Gemini ou Groq, **laisse la clé vide**, colle l'adresse du proxy, puis **Enregistrer** et **Tester la connexion**.

## Sécurité

- Le proxy refuse toute origine autre que `ALLOWED_ORIGIN`. Un site web quelconque ne peut donc pas l'utiliser depuis un navigateur.
- Un script hors navigateur peut toutefois imiter l'en-tête Origin. Garde l'adresse du proxy pour toi, et révoque ta clé si tu vois une consommation anormale.
- Les requêtes de plus de 64 Ko sont refusées, et seules les routes `/groq` et `/gemini/<modèle>` existent.
