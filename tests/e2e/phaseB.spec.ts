import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

const OFF_PRODUCT = {
  status: 1,
  product: { product_name_fr: 'Lben', brands: 'Jaouda', serving_quantity: 200, nutriments: { 'energy-kcal_100g': 45, proteins_100g: 3, carbohydrates_100g: 4.6, fat_100g: 1.5, calcium_100g: 0.12, salt_100g: 0.1, sugars_100g: 4.6 } },
};

async function openAdd(page: Page, meal = 'petit-déjeuner') {
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: `Ajouter au ${meal}` }).click();
}

test('code-barres : Open Food Facts puis hors-ligne depuis le cache', async ({ page, context }) => {
  test.setTimeout(90_000);
  let calls = 0;
  await page.route(/openfoodfacts\.org/, (route) => {
    calls++;
    return route.fulfill({ json: OFF_PRODUCT });
  });
  await completeOnboarding(page);
  await openAdd(page);
  await page.getByRole('tab', { name: 'Scanner' }).click();
  await page.getByLabel('Code-barres (chiffres)').fill('6111242100992');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText(/Produit trouvé sur Open Food Facts/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Lben (Jaouda)' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Lben (Jaouda)')).toBeVisible();
  // Hors-ligne : même produit retrouvé sans réseau.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Ajouter au déjeuner' }).click();
  await page.getByRole('tab', { name: 'Scanner' }).click();
  await page.getByLabel('Code-barres (chiffres)').fill('6111242100992');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText(/déjà enregistré \(disponible hors-ligne\)/)).toBeVisible();
  expect(calls).toBe(1);
  await context.setOffline(false);
  // Code invalide
  await page.getByRole('button', { name: 'Retour' }).click();
  await page.getByLabel('Code-barres (chiffres)').fill('1234567890123');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText(/Code invalide/)).toBeVisible();
});

test('CIQUAL : recherche, ajout, micronutriments du jour', async ({ page }) => {
  await completeOnboarding(page);
  await openAdd(page, 'déjeuner');
  await page.getByRole('dialog').getByRole('searchbox').fill('lentille verte');
  await expect(page.getByTestId('ciqual-results').getByText(/Lentille verte, bouillie/)).toBeVisible();
  await page.getByTestId('ciqual-results').getByText(/Lentille verte, bouillie/).click();
  await page.getByRole('dialog').getByLabel('Quantité').fill('250');
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText(/Lentille verte, bouillie/)).toBeVisible();
  await expect(page.getByTestId('micros')).toContainText('Fibres');
  await expect(page.getByTestId('micros')).toContainText('21 g'); // 8,45 g/100 g × 250 g
  await page.getByRole('button', { name: /Micronutriments \(9\)/ }).click();
  await expect(page.getByTestId('micros')).toContainText('Fer');
});

test('ajout rapide, favoris et repas fréquent', async ({ page }) => {
  await completeOnboarding(page);
  await openAdd(page, 'goûter');
  await page.getByRole('tab', { name: 'Rapide' }).click();
  await page.getByLabel('Description').fill('Msemen du café');
  await page.getByLabel('Calories').fill('320');
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Msemen du café')).toBeVisible();
  await expect(page.getByText('estimation').first()).toBeVisible();
  // Favori depuis l'onglet Aliments
  await page.getByRole('radio', { name: 'Aliments' }).click();
  await page.getByRole('searchbox').fill('amlou');
  await page.getByRole('button', { name: /Amlou/ }).click();
  await page.getByRole('dialog').getByLabel('Ajouter aux favoris').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('radio', { name: 'Journal' }).click();
  await page.getByRole('button', { name: 'Ajouter au dîner' }).click();
  await page.getByRole('tab', { name: 'Favoris' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Amlou/ })).toBeVisible();
});

test('menus de la semaine, liste de courses et budget', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/nutrition?tab=plan');
  await page.getByRole('button', { name: /^Prévoir : Déjeuner/ }).first().click();
  await page.getByRole('dialog').getByRole('searchbox').fill('riz blanc');
  await page.getByRole('dialog').getByRole('button', { name: /^Riz blanc cuit/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: /^Prévoir : Dîner/ }).first().click();
  await page.getByRole('dialog').getByRole('searchbox').fill('poulet');
  await page.getByRole('dialog').getByRole('button', { name: /^Blanc de poulet cuit/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: 'Liste de courses' }).click();
  await expect(page.getByTestId('shopping-list')).toContainText('Riz blanc cuit');
  await expect(page.getByTestId('budget')).toContainText('Budget estimé : 14 DH'); // 180 g riz × 15 DH/kg + 150 g poulet × 75 DH/kg
  await page.getByTestId('shopping-list').getByRole('checkbox', { name: 'Riz blanc cuit' }).check();
  await expect(page.getByTestId('shopping-list').getByRole('checkbox', { name: 'Riz blanc cuit' })).toBeChecked();
});

test('mode Ramadan et cyclage des calories', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/parametres');
  await page.getByLabel(/^Mode Ramadan/).check();
  await page.getByLabel('Heure du s’hour (fin)').fill('04:50');
  await page.getByLabel('Heure du ftour').fill('19:05');
  await page.getByRole('button', { name: 'Enregistrer' }).last().click();
  await page.getByLabel(/^Cyclage des calories/).check();
  await page.goto('./#/nutrition');
  await expect(page.getByTestId('ramadan-card')).toContainText('Jeûne : 14 h 15');
  await expect(page.getByTestId('ramadan-card')).toContainText('19:05');
  await expect(page.getByRole('heading', { name: 'S’hour' })).toBeVisible();
  // Cyclage : il faut un planning cette semaine.
  await page.goto('./#/planning');
  await page.getByRole('button', { name: 'Générer ma semaine' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Générer ma semaine' }).click();
  await page.waitForTimeout(800);
  await page.goto('./#/nutrition');
  await expect(page.getByTestId('day-target-reason')).toContainText(/Jour d’entraînement|Jour de repos/);
});

test('photo de plat analysée par Gemini (réponse simulée), validée avant ajout', async ({ page }) => {
  await page.route(/generativelanguage\.googleapis\.com/, (route) =>
    route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '{"items":[{"name":"Tajine de poulet","grams":350,"kcal":420,"proteinG":32,"carbsG":18,"fatG":24},{"name":"Khobz","grams":90,"kcal":240,"proteinG":7,"carbsG":46,"fatG":3}]}' }] } }] } }),
  );
  await completeOnboarding(page);
  await openAdd(page, 'déjeuner');
  await expect(page.getByRole('tab', { name: 'Photo IA' })).toHaveCount(0); // pas de clé : option masquée
  await page.keyboard.press('Escape');
  await page.goto('./#/parametres');
  await page.getByRole('radio', { name: 'Gemini' }).click();
  await page.getByLabel('Clé API Gemini').fill('AIza-test');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByText('Réglages du coach enregistrés')).toBeVisible();
  await openAdd(page, 'déjeuner');
  await page.getByRole('tab', { name: 'Photo IA' }).click();
  await page.getByLabel('Prendre ou choisir une photo').setInputFiles('tests/e2e/fixtures/photo-after.jpg');
  await expect(page.getByTestId('vision-items')).toContainText('estimation');
  // Correction : 90 g → 45 g de khobz (valeurs divisées par 2).
  await page.getByLabel('Khobz (g)').fill('45');
  await expect(page.getByTestId('vision-items')).toContainText('120 kcal');
  await page.getByRole('button', { name: 'Retirer Tajine de poulet' }).click();
  await page.getByRole('button', { name: 'Ajouter au repas (1)' }).click();
  await expect(page.getByText('Khobz (estimation IA)')).toBeVisible();
});

test('recette : poids cuit et portions', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/nutrition?tab=recipes');
  await page.getByRole('button', { name: 'Nouvelle recette' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nom de la recette').fill('Tajine maison');
  await d.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
  await d.getByRole('searchbox').fill('poulet');
  await d.getByRole('button', { name: /^Blanc de poulet cuit/ }).click();
  await d.getByLabel('Poids final cuit (facultatif)').fill('600');
  await d.getByLabel('Nombre de portions').fill('4');
  await expect(d.getByTestId('per-serving')).toContainText('Par portion (150 g)');
});

test('captures phase B (sombre et clair)', async ({ page }) => {
  test.setTimeout(120_000);
  await completeOnboarding(page);
  await openAdd(page, 'déjeuner');
  await page.getByRole('dialog').getByRole('searchbox').fill('lentille verte');
  await page.getByTestId('ciqual-results').getByText(/Lentille verte, bouillie/).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.goto('./#/parametres');
  await page.getByLabel(/^Mode Ramadan/).check();
  await page.getByRole('button', { name: 'Enregistrer' }).last().click();
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
    }
    await page.goto('./#/nutrition');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/pB-journal-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: /Ajouter au s’hour/ }).click();
    await page.getByRole('tab', { name: 'Scanner' }).click();
    await page.screenshot({ path: `screenshots/pB-scan-${theme}.png` });
    await page.keyboard.press('Escape');
    await page.goto('./#/nutrition?tab=plan');
    await page.screenshot({ path: `screenshots/pB-menus-${theme}.png`, fullPage: true });
  }
});

test('eau : quantité libre (300 ml) et recherche « thé sans sucre »', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Autre quantité d’eau' }).click();
  await page.getByLabel('Quantité bue').fill('300');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('button', { name: '+150 ml' }).click();
  await expect(page.getByTestId('water-total')).toContainText('450');
  await page.getByRole('button', { name: 'Autre quantité d’eau' }).click();
  await page.getByLabel('Quantité bue').fill('5000');
  await expect(page.getByText('Entre 20 et 2 000 ml')).toBeVisible();
  // Recherche par mots : aliment fourni et table CIQUAL.
  await page.getByRole('button', { name: 'Ajouter au petit-déjeuner' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('thé sans sucre');
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Thé à la menthe sans sucre/ })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Thé à la menthe sucré/ })).toHaveCount(0);
  await expect(page.getByTestId('ciqual-results').getByText('Thé infusé, non sucré')).toBeVisible();
});
