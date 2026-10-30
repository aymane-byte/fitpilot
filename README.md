# FitPilot AI

Application fitness personnelle pour iPhone (PWA) : musculation, course, nutrition marocaine, coach, progrès.
**100 % gratuite, sans serveur, sans compte. Toutes les données restent sur ton téléphone.**

---

## Où en est le projet ?

Les 6 phases sont terminées.

| Phase | Contenu | État |
|---|---|---|
| 1 | PWA iPhone, design, base locale, onboarding, profil, tableau de bord, sauvegarde | ✅ |
| 2 | Musculation, 62 exercices, course (manuelle + GPS), planning | ✅ |
| 3 | Nutrition, aliments marocains, recettes, macros, eau | ✅ |
| 4 | FitPilot Coach (règles locales, Gemini/Groq en option, proxy facultatif) | ✅ |
| 5 | Mesures, photos avant/après, rapports, PDF, rappels, export Calendrier | ✅ |
| 6 | Accessibilité (WCAG 2.1 AA), performance, passe de tests complète | ✅ |

**Vérifications automatiques** : 143 tests unitaires, 55 tests de bout en bout (iPhone WebKit + Chromium, dont un audit d'accessibilité axe en thème sombre et clair). Lighthouse mobile : Performance 100, Accessibilité 100, Bonnes pratiques 100. Le SEO est volontairement bas : l'app demande à ne pas être indexée.

---

## Ce que fait l'app

### Accueil
- Résumé du jour : pesée, séance prévue (avec un bouton Démarrer), repas, eau, sauvegarde, et la **prochaine étape recommandée**.
- Poids actuel / cible, tendance sur 7 jours, graphique interactif (pesées, moyenne mobile 7 j, ligne de cible).
- Calories et macros consommées par rapport aux objectifs, suivi de l'eau.
- Semaine en cours : séances faites / prévues, km de course, **série** de jours actifs, records.

### Profil et calculs
- Onboarding pré-rempli (modifiable). Calcul du BMR (Mifflin-St Jeor), du TDEE, de l'objectif calorique et des macros, avec une section « Comment c'est calculé ? ».
- Garde-fous : jamais sous le BMR, perte limitée à 0,75 % du poids par semaine.
- Masse grasse : estimation facultative (formule US Navy).

### Musculation
- 62 exercices (exécution, erreurs fréquentes, muscles), et tes propres exercices.
- 6 plans prédéfinis : 3 j muscu + 2 j course, Full Body, Upper/Lower, PPL, Débutant, Intermédiaire. Tu peux aussi créer tes propres programmes.
- Séance en direct : saisie rapide, minuteur de repos avec bip, **suggestions de surcharge progressive**.
- Historique, records, 1RM estimé (formule d'Epley), courbe de progression.

### Course
- Saisie manuelle (allure, vitesse, calories estimées) ou **suivi GPS** avec carte OpenStreetMap. Les points GPS imprécis ou impossibles sont filtrés, et l'écran reste allumé quand l'iPhone le permet.
- Records 1 km / 5 km / 10 km et plus longue sortie, courbe d'allure, calendrier, objectif hebdomadaire.
- 5 programmes : Débutant 5 km, Intermédiaire 5 km, 10 km, Endurance, Perte de gras.

### Planning
- « Générer ma semaine » d'après ton profil, ton plan de muscu et ton plan de course. **Aucune course dans les 24 h (ou 48 h, au choix) qui suivent des jambes lourdes.** L'app t'avertit si tu en places une toi-même.
- Déplacer une activité, la marquer faite ou sautée. Export **.ics vers l'app Calendrier**, avec un rappel 30 min avant.

### Nutrition
- 57 aliments, dont tous les classiques marocains : khobz, msemen, harcha, harira, bissara, rfissa, zaalouk, loubia, 3dess, tajines, couscous, amlou, raïb, lben…
- Unités maison : tranche et quart de khobz, bol, cuillère, pièce, verre…
- Les plats dont la recette varie sont marqués **« estimé »**. Toutes les valeurs sont modifiables.
- Repas (petit-déjeuner, déjeuner, goûter, dîner, snacks), « Copier d'hier », recettes perso, **alerte allergies**, rapport sur 7 jours.

### FitPilot Coach
- Par défaut, **analyse par règles locale** : hors-ligne, sans clé, et clairement indiquée comme n'étant **pas une IA**. Elle couvre :
  - la tendance de poids ;
  - l'ajustement des calories (±150 kcal selon la tendance réelle, jamais sous le BMR) ;
  - les protéines et la récupération ;
  - les conflits du planning et les incohérences entre ton objectif et tes données ;
  - l'explication des exercices et le bilan de la semaine.
- En option, **Gemini** ou **Groq** avec ta clé gratuite. L'app envoie seulement un résumé compact (profil + 14 derniers jours). Délai maximal, limitation de débit, affichage des tokens, et **repli automatique sur les règles** en cas d'erreur, de quota atteint ou d'absence d'internet.
- Règles de sécurité : pas de diagnostic ni de médicament, jamais sous le BMR, pas de surentraînement, respect des allergies et blessures, conseil de voir un médecin quand c'est pertinent.

### Progrès et rapports
- Poids, taille, poitrine, bras, cuisse, hanches, cou, avec une courbe par mesure.
- **Photos** compressées et stockées uniquement sur le téléphone, avec comparaison avant/après par curseur.
- Rapports hebdomadaires et mensuels :
  - poids moyen et variation, tour de taille ;
  - km de course et allure moyenne ;
  - séances et régularité ;
  - calories et protéines moyennes ;
  - **progrès estimé** (rythme et nombre de semaines jusqu'au poids cible).
- Résumé du coach (règles ou LLM, clairement indiqué) et **export PDF**.
- **Rappels à l'ouverture**, une fois par jour : séance prévue, pesée, sauvegarde, mesures hebdomadaires, photo mensuelle.

---

## Limites (honnêtes)

- **Pas de notifications push** : il faudrait un serveur. Les rappels s'affichent à l'ouverture de l'app. Pour des alertes à heure fixe, exporte ton planning vers Calendrier.
- **GPS sur iPhone** : une app web ne suit pas la position quand l'écran est verrouillé ou l'app en arrière-plan. Garde FitPilot ouvert pendant la course. Une course interrompue est récupérée à la réouverture.
- **Vibration** : Safari sur iPhone ne permet pas aux sites web de vibrer. La fin du repos est signalée par un son (mode silencieux désactivé).
- **Valeurs nutritionnelles** : valeurs de référence arrondies (USDA FoodData Central, CIQUAL). Les plats traditionnels sont des estimations.
- **Calories brûlées, 1RM, masse grasse et progrès** sont des **estimations**. FitPilot ne remplace pas un avis médical.
- **Testé** avec les moteurs WebKit et Chromium de Playwright, au format iPhone 390×844, et avec un GPS simulé. **Pas encore testé sur un vrai iPhone** : fais un essai de course GPS courte et un essai de sauvegarde/restauration après l'installation.
- Dans le WebKit de test sous Windows, la restauration d'une sauvegarde prend environ 5 s (environ 0,6 s dans Chromium). Un libellé « Restauration… » s'affiche pendant l'opération.

---

## 1. Lancer l'app sur ton ordinateur

Il faut [Node.js](https://nodejs.org) version 22 ou plus récente.

```bash
npm install
npm run dev
```

Ouvre l'adresse affichée (par exemple `http://localhost:5173`).

```bash
npm test                                  # tests unitaires (Vitest)
npx playwright install webkit chromium    # une seule fois
npm run test:e2e                          # tests de bout en bout + accessibilité
npm run build                             # version de production dans dist/
```

---

## 2. Mettre l'app en ligne gratuitement

L'iPhone a besoin d'une adresse **HTTPS** pour installer l'app et utiliser le GPS.

### Option A : GitHub Pages (déjà configurée)

1. Crée un compte gratuit sur [github.com](https://github.com).
2. Crée un **nouveau dépôt public** (par exemple `fitpilot`). GitHub Pages est gratuit pour les dépôts publics. Tes données ne sont pas dans le code, elles restent sur ton téléphone.
3. Dans le dossier du projet :
   ```bash
   git add .
   git commit -m "FitPilot"
   git branch -M main
   git remote add origin https://github.com/TON-PSEUDO/fitpilot.git
   git push -u origin main
   ```
4. Sur GitHub : **Settings → Pages → Source : GitHub Actions**.
5. Onglet **Actions** : le déploiement lance d'abord les tests, puis publie l'app. Au bout de 1 à 2 minutes, l'app est en ligne sur `https://TON-PSEUDO.github.io/fitpilot/`.

Chaque `git push` met l'app à jour. Sur le téléphone, un bandeau « Nouvelle version disponible » propose la mise à jour.

### Option B : Cloudflare Pages

1. Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Create → Pages → Connect to Git**, puis choisis ton dépôt.
3. Build command : `npm run build`. Output directory : `dist`. Variable d'environnement : `NODE_VERSION` = `24`.
4. **Save and Deploy**. L'adresse ressemble à `https://fitpilot.pages.dev`.

---

## 3. Installer l'app sur ton iPhone

1. Ouvre l'adresse de ton app dans **Safari**.
2. Touche **Partager** (le carré avec une flèche vers le haut).
3. Choisis **« Sur l'écran d'accueil »**, puis **Ajouter**.
4. Lance toujours FitPilot **depuis cette icône** : plein écran, et fonctionnement hors-ligne.

Ensuite :
- **Plus → Paramètres → Stockage** : touche « Demander le stockage persistant ».
- Les données de l'app installée sont **séparées** de celles de Safari. Si tu as testé dans Safari, sauvegarde là-bas, puis restaure dans l'app installée.

---

## 4. Sauvegarder tes données (important)

Safari peut parfois effacer les données d'un site. **Fais une sauvegarde chaque semaine.** L'app te le rappelle.

**Exporter :** **Plus → Paramètres → Sauvegarde → Exporter mes données**, puis **« Enregistrer dans Fichiers »** (iCloud Drive ou l'iPhone).
- Coche « Inclure les photos de progrès » pour les sauvegarder aussi. Le fichier sera plus lourd.
- Les clés API ne sont **jamais** incluses.

**Restaurer :** **Paramètres → Restaurer une sauvegarde** (ou le bouton du premier écran sur un téléphone neuf). L'app vérifie le fichier et affiche son contenu avant de restaurer. ⚠️ Les données actuelles sont **remplacées**.

---

## 5. Ajouter une clé Gemini ou Groq (facultatif)

Le coach fonctionne très bien sans clé (règles locales). Pour des réponses rédigées par une IA :

1. Crée une clé gratuite :
   - **Gemini** : [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Modèle par défaut : `gemini-3.5-flash-lite` (gratuit en octobre 2026). Autres choix : `gemini-3.6-flash`, `gemini-2.5-flash`.
   - **Groq** : [console.groq.com/keys](https://console.groq.com/keys). Modèle par défaut : `openai/gpt-oss-20b` (limites gratuites de départ : environ 30 requêtes/min et 1 000/jour). Autres choix : `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`.
2. **Plus → Paramètres → Coach IA** : choisis le fournisseur, colle la clé, **Enregistrer**, puis **Tester la connexion**.
3. ⚠️ La clé reste **uniquement sur ton téléphone**, mais quelqu'un qui a ton téléphone déverrouillé peut la lire. Utilise une clé dédiée, que tu peux révoquer.
4. Les noms de modèles et les quotas gratuits changent souvent. Le champ « Modèle » est libre : vérifie la liste sur le site du fournisseur si un modèle disparaît.

**Option sans clé sur le téléphone :** déploie le petit proxy Cloudflare gratuit fourni dans [`proxy/`](proxy/README.md). La clé devient un secret Cloudflare, et tu colles seulement l'adresse du proxy dans l'app. Gemini et Groq acceptent aussi les appels directs depuis le navigateur (vérifié), donc le proxy n'est pas obligatoire.

---

## Structure du code

```
src/
  lib/            calculs purs et testés : énergie, stats, dates, force (1RM, surcharge),
                  course, GPS (haversine, filtrage, segments), planning, .ics, nutrition,
                  rapports, rappels, coach (contexte, règles, fournisseurs LLM)
  db/             base Dexie (IndexedDB, schéma v3 + migrations), sauvegarde/restauration
  db/seed/        exercices, programmes, aliments fournis avec l'app
  i18n/           toutes les chaînes (fr.ts) : ajouter ar.ts pour l'arabe/darija
  components/     composants d'interface réutilisables
  features/       écrans : dashboard, workouts, running, planning, nutrition, coach,
                  progress, reports, reminders, settings, profile, onboarding, install
proxy/            proxy Cloudflare Worker facultatif (+ tests)
tests/e2e/        tests Playwright (iPhone WebKit 390×844 + Chromium, accessibilité axe)
```

- **Base de données** : 20 tables, schéma versionné (v1 → v2 → v3), migration testée. Les photos sont stockées en ArrayBuffer : certains WebKit refusent les Blob dans IndexedDB.
- **Données de départ** : insérées une seule fois, avec des clés stables. Elles ne sont jamais dupliquées, et ce que tu supprimes n'est pas recréé.
