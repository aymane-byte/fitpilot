import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

const seconds = (txt: string) => txt.split(':').map(Number).reduce((s, v) => s * 60 + v, 0);

test('pause automatique désactivée par défaut : le chrono continue à l’arrêt', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await page.goto('./#/course/gps');
  await expect(page.getByLabel(/^Pause automatique/)).not.toBeChecked();
  await page.getByRole('button', { name: 'Démarrer' }).click();
  let lat = 33.5;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    lat += 4 / 111_195;
    await context.setGeolocation({ latitude: lat, longitude: -7.6, accuracy: 5 });
  }
  // Arrêt de 14 s (bruit GPS d'1 m) : pas de pause, le temps continue.
  const before = seconds(await page.getByTestId('gps-time').innerText());
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(1000);
    await context.setGeolocation({ latitude: lat + (i % 2) / 111_195, longitude: -7.6, accuracy: 5 });
  }
  await expect(page.getByTestId('auto-paused')).toHaveCount(0);
  expect(seconds(await page.getByTestId('gps-time').innerText())).toBeGreaterThanOrEqual(before + 12);
});

test('types d’activité : marche et vélo', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course');
  for (const [type, km, dur] of [['Marche', '5', '60'], ['Vélo', '20', '40']]) {
    await page.getByRole('button', { name: 'Saisir une course' }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('radio', { name: type }).click();
    await d.getByLabel('Distance').fill(km);
    await d.getByLabel('Durée').fill(dur);
    await d.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(d).toBeHidden({ timeout: 15_000 });
  }
  await page.goto('./#/course/activites');
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Vélo' })).toContainText('20 km');
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Marche' })).toContainText('5 km');
  await page.getByLabel('Type').selectOption({ label: 'Marche' });
  await expect(page.getByTestId('activity-row')).toHaveCount(1);
});

test('chat : question sur un aliment (darija) → convient-il, comment, quantité', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/coach');
  await page.getByPlaceholder('Pose ta question…').fill('wach nakol amlou ? chhal khasni nakol ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(/^Amlou : \d+ kcal/)).toBeVisible();
  await expect(page.getByText(/Quantité conseillée : environ \d+ g/)).toBeVisible();
  await expect(page.getByText(/Comment le manger/)).toBeVisible();
});

test('chat : photo sans clé Gemini (explication) puis avec Gemini (réponse simulée)', async ({ page }) => {
  test.setTimeout(90_000);
  let sentImage = false;
  await page.route(/generativelanguage\.googleapis\.com/, async (route) => {
    const body = route.request().postDataJSON();
    sentImage = JSON.stringify(body).includes('inline_data');
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'Je vois un tajine de poulet (~350 g) et du khobz (~90 g). Estimation : ~650 kcal.' }] } }] } });
  });
  await completeOnboarding(page);
  await page.goto('./#/coach');
  await page.locator('input[type=file]').setInputFiles('tests/e2e/fixtures/photo-after.jpg');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(/il faut une clé Gemini gratuite/)).toBeVisible();
  await expect(page.getByTestId('msg-photo')).toBeVisible();
  // Avec une clé Gemini (le fournisseur choisi reste « règles ») : la photo part chez Gemini.
  await page.goto('./#/parametres');
  await page.getByRole('radio', { name: 'Gemini' }).click();
  await page.getByLabel('Clé API Gemini').fill('AIza-test');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.goto('./#/coach');
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click().catch(() => {});
  await page.locator('input[type=file]').setInputFiles('tests/e2e/fixtures/photo-after.jpg');
  await page.getByPlaceholder('Pose ta question…').fill('C’est bon pour moi ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(/Je vois un tajine de poulet/)).toBeVisible();
  expect(sentImage).toBe(true);
});

test('micronutriments : anciens repas (notés sans micronutriments) recalculés au démarrage', async ({ page }) => {
  test.setTimeout(90_000);
  await completeOnboarding(page);
  await page.goto('./#/nutrition');
  // Simule un téléphone qui a noté un repas avec une ancienne version de l'app.
  await page.evaluate(async () => {
    const req = indexedDB.open('fitpilot');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = db.transaction(['foods', 'meals', 'mealItems', 'settings'], 'readwrite');
    const foods = tx.objectStore('foods');
    const lent: { id: number } = await new Promise((r) => {
      const q = foods.index('key').get('lentils');
      q.onsuccess = () => r(q.result);
    });
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const mealId: number = await new Promise((r) => {
      const q = tx.objectStore('meals').add({ date, type: 'lunch' });
      q.onsuccess = () => r(q.result as number);
    });
    tx.objectStore('mealItems').add({ mealId, foodId: lent.id, grams: 200, name: 'Lentilles cuites (3dess)', kcal: 232, proteinG: 18, carbsG: 40, fatG: 1 });
    const s = tx.objectStore('settings');
    const cur: Record<string, unknown> = await new Promise((r) => {
      const q = s.get('app');
      q.onsuccess = () => r(q.result);
    });
    s.put({ ...cur, microsBackfill: 0 });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  await page.reload();
  await expect(page.getByTestId('micros')).toContainText(/Fibres/);
  await expect(page.getByTestId('micros')).not.toContainText('renseigné pour 0 %', { timeout: 15_000 });
  await expect(page.getByTestId('micros')).toContainText('renseigné pour 100 %');
});
