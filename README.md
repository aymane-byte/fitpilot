# FitPilot AI

Application fitness personnelle pour iPhone (PWA) : musculation, course, nutrition marocaine, coach, progrès.
**100 % gratuite, sans serveur, sans compte. Toutes les données restent sur ton téléphone.**

---

## Où en est le projet ?

Les 6 phases de départ et la deuxième série (A : course avancée, B : nutrition complète, C : finitions) sont terminées et en ligne.

| Phase | Contenu | État |
|---|---|---|
| 1 | PWA iPhone, design, base locale, onboarding, profil, tableau de bord, sauvegarde | ✅ |
| 2 | Musculation, 62 exercices, course (manuelle + GPS), planning | ✅ |
| 3 | Nutrition, aliments marocains, recettes, macros, eau | ✅ |
| 4 | FitPilot Coach (règles locales, Gemini/Groq en option, proxy facultatif) | ✅ |
| 5 | Mesures, photos avant/après, rapports, PDF, rappels, export Calendrier | ✅ |
| 6 | Accessibilité (WCAG 2.1 AA), performance, passe de tests complète | ✅ |
| A | Course « type Strava » : splits, meilleurs efforts, dénivelé, voix, séances guidées, cartes, charge, VDOT, chaussures, météo, partage, GPX/FIT, objectifs | ✅ |
| B | Nutrition complète : code-barres + Open Food Facts, CIQUAL, micronutriments, favoris, repas fréquents, ajout rapide, recettes en portions, menus + courses en DH, cyclage des calories, mode Ramadan, photo IA (option) | ✅ |
| C | Widgets du tableau de bord (charge, VDOT, objectifs, chaussures, micronutriments, Ramadan) et coach à règles enrichi | ✅ |

**Vérifications automatiques** : 265 tests unitaires et 88 tests de bout en bout (iPhone WebKit + Chromium), dont un audit d'accessibilité axe en thème sombre et clair.

**Lighthouse mobile** (médiane de 3 mesures sur cette machine) : Performance 92, Accessibilité 100, Bonnes pratiques 100. Dans les mêmes conditions, la version des phases 1–6 obtient 95 : les nouveautés coûtent environ 0,3 s au tout premier affichage. Le SEO est volontairement bas : l'app demande à ne pas être indexée.

---

## Ce que fait l'app

### Accueil
- Widgets : forme / fatigue / fraîcheur et VDOT, progression des objectifs de distance, alerte chaussures, fibres / sel / sucres du jour, carte Ramadan, objectif calorique du jour (cyclage).
- Résumé du jour : pesée, séance prévue (avec un bouton Démarrer), repas, eau, sauvegarde, et la **prochaine étape recommandée**.
- Poids actuel / cible, tendance sur 7 jours, graphique interactif (pesées, moyenne mobile 7 j, ligne de cible).
- Calories et macros consommées par rapport aux objectifs, suivi de l'eau (+150 / +250 / +500 ml ou quantité libre de 20 à 2 000 ml).
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
- Saisie manuelle (allure, vitesse, calories estimées, chaussures, effort ressenti) ou **suivi GPS** avec carte vectorielle (MapLibre + OpenFreeMap). Les points GPS imprécis ou impossibles sont filtrés, et l'écran reste allumé quand l'iPhone le permet.
- **Écran d'enregistrement** : temps en très grand, distance, allure actuelle et moyenne, carte en direct, gros boutons Pause et Terminer, et bannière permanente « Garde l'écran allumé ».
- **Pause automatique** (désactivable) : après ~10 s immobile (feu rouge), le chrono s'arrête et le temps d'arrêt n'est pas compté. Il reprend dès que tu t'éloignes de 12 m. Une annonce vocale signale la pause et la reprise.
- **Rien n'est perdu** : l'état de la course et les points GPS sont écrits dans IndexedDB toutes les 5 s, et tout de suite quand l'app passe en arrière-plan. Si FitPilot est fermée ou rechargée en pleine course, l'enregistrement **reprend automatiquement**. Une course mise en pause propose « Reprendre / Enregistrer / Supprimer ».
- **Chrono exact** : le temps est calculé à partir des horodatages (départ, pauses, reprises), jamais en comptant des secondes. Il reste juste même si iOS a suspendu l'app.
- **Trous GPS** : plus de 30 s sans position pendant la course (écran verrouillé, app en arrière-plan) déclenche le message « GPS interrompu pendant X min ». Les deux points sont reliés par une ligne droite estimée, en pointillés sur la carte. La distance estimée apparaît à part dans le détail, et tu choisis de garder ou de retirer cette partie, pendant la course comme après.
- **Mode poche** :
  - écran entièrement noir, Wake Lock actif ;
  - tactile verrouillé, déverrouillage par appui long (1,5 s) ou glissement vers le haut ;
  - annonces vocales toujours actives ;
  - temps et distance en tout petit, gris très sombre.

  Au démarrage, un avertissement rappelle : « Ne verrouille pas l'écran, utilise le mode poche ».
- **Importer depuis Strava** : écran d'aide pour exporter un GPX sur strava.com, ou toute l'archive. Les fichiers `.gpx.gz` / `.fit.gz` de l'archive sont acceptés tels quels.
- **Mes activités** : liste avec mini-carte du tracé, filtres (semaine, mois, année, type) et tri (récentes, anciennes, distance, allure, durée).
- **Parcours favoris** : enregistre le tracé d'une course. FitPilot retrouve ensuite toutes les courses faites sur ce trajet (distance à ±12 %, tracé à moins de 60 m dans les deux sens), les classe par temps, affiche l'écart au record et l'évolution, et indique sur chaque course son rang sur le parcours.
- **Modifier une activité** : nom, note, type, chaussures et effort ressenti. Tu peux aussi la **recadrer** (retirer le début ou la fin, distance et records recalculés) ou la supprimer.
- **Détail d'une course** :
  - splits par km (temps, allure, D+ / D−) ;
  - meilleurs efforts détectés sur le tracé (400 m, 1 km, 1 mile, 5 km, 10 km, semi) avec badge « Record » ;
  - profil d'altitude et carte colorée selon l'allure ;
  - météo au milieu de la course ;
  - image de partage (feuille de partage iOS) et export GPX.
- **Dénivelé** : altitude GPS lissée (filtre médian, moyenne glissante, hystérésis de 5 m). Si la course n'a pas d'altitude, elle est récupérée via l'API gratuite d'élévation **Open-Meteo**.
- **Annonces vocales** en français à chaque km (temps, allure du km, allure moyenne), réglables dans Paramètres.
- **Séances guidées** : fractionnés, tempo, allure cible, et séances perso. La voix annonce le début et la fin de chaque répétition, et dit « trop rapide » ou « trop lent » (au plus toutes les 30 s).
- **Cartes vectorielles MapLibre GL + OpenFreeMap** :
  - nettes sur écran Retina, zoom fluide, rotation désactivée ;
  - fond « positron » (clair épuré) ou « dark » (sombre), selon le thème de l'app ;
  - tracé épais avec contour, coins arrondis, couleur selon l'allure (9 nuances, légende) ;
  - départ vert, arrivée en damier, marqueurs de km ;
  - toucher le tracé affiche la distance, l'allure et l'altitude à cet endroit ;
  - ombrage du **relief** en option ;
  - carte en direct avec point de position et halo, suivi de la position et bouton « Recentrer ».

  MapLibre n'est chargé que sur les écrans qui ont une carte.
- **Carte de chaleur** de toutes les courses (lignes lumineuses superposées ; 12 mois, 3 mois ou tout).
- **Mini-cartes** de l'historique : images du tracé dessinées une fois en canvas, sans vraie carte par ligne.
- **Charge d'entraînement** : forme (CTL, 42 j), fatigue (ATL, 7 j), fraîcheur (TSB). Chaque course reçoit un score = durée × intensité² × 100, l'intensité venant de l'effort ressenti, sinon de l'allure par rapport au seuil, sinon du type de course. Le calcul est expliqué dans l'app.
- **VDOT** (formule de Daniels) d'après le meilleur effort des 6 derniers mois, temps prédits 5 km / 10 km / semi / marathon et allures d'entraînement. Tout est marqué « estimation ».
- **Chaussures** : km par paire (y compris les km d'avant), paire par défaut, alerte vers 600–800 km (seuil réglable).
- **Import GPX** (Strava : « Exporter le GPX ») et **FIT** (montres) avec détection des doublons et des pauses. Lecture FIT par `fit-file-parser` (MIT). Le SDK officiel de Garmin n'est pas utilisé : sa licence interdit de le redistribuer dans une app publique.
- Records, courbe d'allure, calendrier, **objectifs semaine / mois / année** avec progression, retard ou avance, et projection.
- 5 programmes : Débutant 5 km, Intermédiaire 5 km, 10 km, Endurance, Perte de gras.

### Planning
- « Générer ma semaine » d'après ton profil, ton plan de muscu et ton plan de course. **Aucune course dans les 24 h (ou 48 h, au choix) qui suivent des jambes lourdes.** L'app t'avertit si tu en places une toi-même.
- Déplacer une activité, la marquer faite ou sautée. Export **.ics vers l'app Calendrier**, avec un rappel 30 min avant.

### Nutrition
- 57 aliments, dont tous les classiques marocains : khobz, msemen, harcha, harira, bissara, rfissa, zaalouk, loubia, 3dess, tajines, couscous, amlou, raïb, lben…
- Unités maison : tranche et quart de khobz, bol, cuillère, pièce, verre…
- Les plats dont la recette varie sont marqués **« estimé »**. Toutes les valeurs sont modifiables.
- Repas (petit-déjeuner, déjeuner, goûter, dîner, snacks), « Copier d'hier », recettes perso, **alerte allergies**, rapport sur 7 jours.
- **Recherche par mots** : ordre libre, sans accents ni pluriels, début de mot suffisant, « sans » = « non » (« thé sans sucre » trouve « Thé infusé, non sucré », jamais « Thé sucré »). Des résultats approchés s'affichent pour les requêtes de 3 mots ou plus.
- **Table CIQUAL 2020** (ANSES, Licence Ouverte) : 2 298 aliments avec une énergie officielle, cherchés en même temps que tes aliments. Le fichier (82 Ko compressé) est disponible hors-ligne. Un aliment CIQUAL n'est copié dans ta base que lorsque tu l'utilises : tes aliments marocains et tes valeurs modifiées ne sont jamais écrasés.
- **Scanner de code-barres** (ZXing, fonctionne dans Safari iOS) avec recherche sur **Open Food Facts**. Si la caméra n'est pas disponible : photo du code ou saisie des chiffres. Les produits trouvés sont gardés sur le téléphone : un produit déjà scanné se retrouve hors-ligne.
- **Micronutriments** : fibres, sucres, sel/sodium, graisses saturées, fer, calcium, potassium, vitamines D et B12, avec des repères selon ton profil (ANSES / EFSA, OMS pour le sel). L'app indique quelle part des aliments est renseignée : une valeur inconnue n'est jamais comptée comme 0.
- **Favoris, récents, repas fréquents** (mêmes aliments notés au moins 2 fois) et **ajout rapide** en kcal/macros, marqué « estimation ».
- **Recettes** : ingrédients en poids cru, poids cuit du plat fini, nombre de portions (unité « portion »).
- **Menus de la semaine** et **liste de courses** générée automatiquement. Les recettes sont remplacées par leurs ingrédients crus. Budget estimé en dirhams, avec des prix indicatifs modifiables pour les aliments fournis.
- **Cyclage des calories** (option) : plus les jours d'entraînement, moins les jours de repos, d'après ton planning réel. La moyenne de la semaine ne change pas, et l'objectif ne descend jamais sous le BMR.
- **Mode Ramadan** (option) :
  - repas renommés (s'hour, ftour) ;
  - plan d'eau réparti entre ftour et s'hour ;
  - créneaux d'entraînement conseillés ;
  - déficit limité à 10 % de la dépense.
- **Photo d'un plat analysée par IA** : seulement si une clé Gemini est configurée. Tu vérifies et corriges chaque ligne avant l'ajout, et le résultat est toujours marqué « estimation ».

### FitPilot Coach
- Par défaut, **analyse par règles locale** : hors-ligne, sans clé, et clairement indiquée comme n'étant **pas une IA**. Elle couvre :
  - la tendance de poids ;
  - l'ajustement des calories (±150 kcal selon la tendance réelle, jamais sous le BMR) ;
  - les protéines et la récupération ;
  - les conflits du planning et les incohérences entre ton objectif et tes données ;
  - l'explication des exercices et le bilan de la semaine.
- En option, **Gemini** ou **Groq** avec ta clé gratuite. L'app envoie seulement un résumé compact (profil + 14 derniers jours). Délai maximal, limitation de débit, affichage des tokens, et **repli automatique sur les règles** en cas d'erreur, de quota atteint ou d'absence d'internet.
- Le coach à règles utilise aussi :
  - la charge d'entraînement (surcharge, rampe trop rapide, fraîcheur) et le VDOT ;
  - les micronutriments des 7 derniers jours (fibres, sel, sucres, fer, calcium), avec des aliments marocains suggérés, mais seulement si assez d'aliments sont renseignés ;
  - le mode Ramadan (eau entre ftour et s'hour, placement de l'entraînement) ;
  - l'usure des chaussures.

  Ces données sont aussi ajoutées au résumé compact envoyé à Gemini ou Groq.
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
- **À tester sur un vrai iPhone** : le mode poche (Wake Lock dans l'app installée selon la version d'iOS, appui long), la reprise automatique après une vraie fermeture par iOS, la détection d'un vrai trou GPS écran verrouillé, et la fluidité des cartes. Tout cela a été vérifié avec une horloge et des positions simulées dans le WebKit de Playwright, pas sur un appareil.
- **Pause automatique** : elle se décide sur les positions GPS. Si l'iPhone en envoie moins quand tu es immobile, la pause peut se déclencher quelques secondes plus tard. Testée avec un GPS simulé, **pas encore lors d'une vraie course**.
- **Voix** : les annonces s'arrêtent aussi quand l'écran se verrouille, et la première lecture doit suivre un toucher (bouton Démarrer). Le WebKit de test n'a pas de synthèse vocale : la voix n'a été vérifiée qu'à travers le texte annoncé, **pas encore à l'oreille sur iPhone**.
- **Impossible dans une PWA iOS** (non simulé) : Apple Santé (pas d'API web), ceinture cardio Bluetooth (pas de Web Bluetooth dans Safari), GPS écran verrouillé. L'intensité vient donc de l'effort ressenti ou de l'allure.
- **Cartes — sources et conditions vérifiées le 01/11/2026** :
  - **OpenFreeMap** : gratuit, sans clé ni limite, usage commercial autorisé, attribution OpenStreetMap obligatoire (affichée en bas, détail derrière le bouton (i)). Le téléchargement de zones pour le hors-ligne n'est permis qu'avec un User-Agent propre à l'app, ce qu'un navigateur ne peut pas envoyer : FitPilot ne télécharge donc aucune zone. Il garde seulement en cache les tuiles déjà affichées (≤ 1 500 tuiles, 30 jours). Sans réseau et sans cache, le tracé s'affiche sur un fond neutre.
  - **Relief** : « Terrain Tiles » (Registre de données ouvertes AWS, Mapzen). Attribution des sources (USGS SRTM/GMTED, NOAA ETOPO1, EU-DEM…) dans la carte.
  - **Satellite : non ajouté**. La seule source gratuite trouvée (Sentinel-2 Cloudless d'EOX) annonce une licence non commerciale, mais je n'ai pas pu en lire le texte intégral : je ne l'active pas sans vérification. De plus, sa résolution (10 m) est floue à l'échelle d'une rue.
- **Météo et altitude de secours** viennent d'Open-Meteo (gratuit, usage non commercial). Hors-ligne, elles sont récupérées plus tard, à l'ouverture de la course. La météo est celle d'une grille de modèle, pas d'une station au coin de la rue.
- **Vibration** : Safari sur iPhone ne permet pas aux sites web de vibrer. La fin du repos est signalée par un son (mode silencieux désactivé).
- **Valeurs nutritionnelles** : valeurs de référence arrondies (USDA FoodData Central, CIQUAL). Les plats traditionnels sont des estimations.
- **CIQUAL** : le site de l'ANSES était en maintenance lors de la préparation. Le fichier officiel (XML du 07/07/2020) a été récupéré depuis sa copie archivée par la Wayback Machine, puis converti par `scripts/ciqual-convert.py`. 887 aliments n'ont pas de valeur énergétique officielle : ils sont écartés plutôt qu'estimés.
- **Scanner** : la caméra dans une app installée sur l'écran d'accueil dépend de la version d'iOS, et elle n'a **pas pu être testée sur un vrai iPhone**. Le repli « photo du code » ou la saisie des chiffres fonctionne partout. Open Food Facts est une base collaborative : vérifie l'étiquette en cas de doute.
- **Photo IA** : l'image part chez Google avec ta clé. L'estimation des quantités sur photo est approximative (±30 % ou plus).
- **Prix** : indicatifs, modifiables. Ils varient selon la ville et la saison.
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
