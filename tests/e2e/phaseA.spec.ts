import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

/** GPX de 5 km (3 m/s, une colline de 40 m), départ il y a 3 jours à 7 h UTC. */
function gpxFixture(name = 'Sortie du matin') {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 3);
  start.setUTCHours(7, 0, 0, 0);
  const dLat = 6 / 111_195; // 6 m tous les 2 s
  const pts: string[] = [];
  for (let i = 0; i < 834; i++) {
    const alt = 20 + 40 * Math.sin((Math.PI * i) / 834);
    pts.push(`<trkpt lat="${(33.5 + i * dLat).toFixed(7)}" lon="-7.6"><ele>${alt.toFixed(1)}</ele><time>${new Date(start.getTime() + i * 2000).toISOString()}</time></trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="StravaGPX" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

async function mockOpenMeteo(page: Page) {
  await page.route(/open-meteo\.com/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('elevation')) {
      const n = url.searchParams.get('latitude')!.split(',').length;
      return route.fulfill({ json: { elevation: Array.from({ length: n }, (_, i) => 10 + i * 0.2) } });
    }
    const day = url.searchParams.get('start_date')!;
    const base = Date.parse(`${day}T00:00:00Z`) / 1000;
    const hours = Array.from({ length: 24 }, (_, h) => base + h * 3600);
    return route.fulfill({ json: { hourly: { time: hours, temperature_2m: hours.map(() => 27.4), apparent_temperature: hours.map(() => 29), relative_humidity_2m: hours.map(() => 55), wind_speed_10m: hours.map(() => 14), precipitation: hours.map(() => 0), weather_code: hours.map(() => 1) } } });
  });
}

async function importGpx(page: Page, content = gpxFixture()) {
  await page.goto('./#/course');
  await page.getByRole('button', { name: /Importer/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'sortie.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(content) });
  await expect(page.getByTestId('import-preview')).toContainText('5 km');
  await page.getByRole('dialog').getByRole('button', { name: 'Importer cette course' }).click();
  // WebKit de Playwright sous Windows : IndexedDB très lent (~15 ms/écriture) → délai large.
  await expect(page.getByText('Course importée')).toBeVisible({ timeout: 40_000 });
}

test('import GPX : splits, dénivelé, records, météo, partage, export', async ({ page }) => {
  test.setTimeout(150_000);
  await mockOpenMeteo(page);
  await completeOnboarding(page);
  await importGpx(page);
  // Détail
  await expect(page.getByRole('heading', { name: 'Sortie du matin' })).toBeVisible();
  await expect(page.getByText(/^\+(39|40|41) \/ −(39|40|41) m$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Temps au kilomètre' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Meilleurs efforts' })).toBeVisible();
  await expect(page.getByText('Record').first()).toBeVisible();
  await expect(page.getByText('27 °C')).toBeVisible();
  await expect(page.getByText(/Temps chaud/)).toBeVisible();
  await expect(page.getByText('Rapide', { exact: false }).first()).toBeVisible();
  // Image de partage générée
  await page.getByRole('button', { name: 'Partager l’image' }).click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  // Export GPX (téléchargement sur ordinateur, feuille de partage sur iPhone)
  const canShare = await page.evaluate(() => !!navigator.canShare);
  if (!canShare) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter GPX' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.gpx$/);
  }
  // Records sur la page Course
  await page.goto('./#/course');
  await expect(page.getByText('1 mile')).toBeVisible();
  // Doublon détecté au second import
  await page.getByRole('button', { name: /Importer/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'sortie.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpxFixture()) });
  await expect(page.getByText(/existe déjà/)).toBeVisible();
});

test('fichier non course refusé', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course');
  await page.getByRole('button', { name: /Importer/ }).click();
  const bike = gpxFixture().replace('<type>running</type>', '<type>cycling</type>');
  await page.locator('input[type=file]').setInputFiles({ name: 'velo.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(bike) });
  await expect(page.getByText(/pas une course à pied/)).toBeVisible();
});

test('forme, VDOT et prédictions après import', async ({ page }) => {
  test.setTimeout(150_000);
  await mockOpenMeteo(page);
  await completeOnboarding(page);
  await importGpx(page);
  await page.goto('./#/course/forme');
  // 5 km en ~27:47 → VDOT ≈ 34
  const vdot = Number((await page.getByTestId('vdot').innerText()).split(' ')[0].replace(',', '.'));
  expect(vdot).toBeGreaterThan(32);
  expect(vdot).toBeLessThan(37);
  await expect(page.getByTestId('pred-marathon')).toContainText('≈');
  await expect(page.getByText('Fractionné (VMA)')).toBeVisible();
  await page.getByRole('button', { name: 'Comment c’est calculé ?' }).click();
  await expect(page.getByText(/durée \(h\) × intensité² × 100/)).toBeVisible();
});

test('chaussures : usure, alerte, attribution par défaut', async ({ page }) => {
  test.setTimeout(150_000);
  await mockOpenMeteo(page);
  await completeOnboarding(page);
  await page.goto('./#/course/chaussures');
  await page.getByRole('button', { name: 'Ajouter une paire' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom').fill('Pegasus bleues');
  await dialog.getByLabel('Km déjà parcourus').fill('598');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('shoe-row')).toContainText('598 / 700 km');
  await expect(page.getByTestId('shoe-row')).toContainText('En bon état');
  // Une course importée lui est attribuée par défaut → 603 km : bientôt à remplacer.
  await importGpx(page);
  await expect(page.getByText('Pegasus bleues')).toBeVisible();
  await page.goto('./#/course');
  await expect(page.getByText(/Pegasus bleues : 603 km, pense à les remplacer/)).toBeVisible();
  await page.goto('./#/course/chaussures');
  await expect(page.getByTestId('shoe-row')).toContainText('Bientôt à remplacer');
});

test('objectifs semaine / mois / année', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course');
  await page.getByRole('button', { name: 'Saisir une course' }).click();
  await page.getByLabel('Distance').fill('8');
  await page.getByLabel('Durée').fill('45');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Mois', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Distance visée').fill('100');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('goal-month')).toContainText('8 / 100 km');
  await expect(page.getByTestId('goal-month')).toContainText('km restants');
  await page.getByRole('button', { name: 'Année', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Distance visée').fill('5');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('goal-year')).toContainText('Objectif atteint');
});

test('séance guidée allure cible : étape, alerte d’allure, voix, fin', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  // 150 m à 3:00/km (±8 s) : on court à ~5,6 m/s ≈ 2:59/km → dans l'allure.
  await page.goto('./#/course/gps?seance=cible-150-180-8');
  await expect(page.getByTestId('gps-workout')).toContainText('Allure cible');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page.getByTestId('step-card')).toContainText('Effort');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.lastSpeech)).toContain('Effort : 150 mètres à 3 minutes par kilomètre');
  for (let i = 1; i <= 34; i++) {
    await page.waitForTimeout(1200);
    await context.setGeolocation({ latitude: 33.5 + i * 0.00006, longitude: -7.6, accuracy: 5 });
  }
  await expect(page.getByTestId('step-card')).toContainText('Séance terminée');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.lastSpeech)).toContain('Séance terminée');
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.getByRole('button', { name: 'Enregistrer la course' }).click();
  await expect(page.getByText(/Séance guidée : Allure cible/)).toBeVisible();
});

test('séances : création perso, visible dans la course GPS ; réglages voix', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course/seances');
  await expect(page.getByText('Fractionné 8 × 400 m')).toBeVisible();
  await page.getByRole('button', { name: 'Créer une séance' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nom de la séance').fill('6 × 800 m piste');
  await d.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Mes séances' })).toBeVisible();
  await page.getByRole('button', { name: 'Démarrer : 6 × 800 m piste' }).click();
  await expect(page.getByTestId('gps-workout')).toHaveText('6 × 800 m piste');
  // Réglages voix
  await page.goto('./#/parametres');
  await expect(page.getByRole('heading', { name: 'Annonces vocales (course)' })).toBeVisible();
  await page.getByLabel('Allure moyenne').uncheck();
  await page.reload();
  await expect(page.getByLabel('Allure moyenne')).not.toBeChecked();
  // Le WebKit de Playwright n'a pas de synthèse vocale : l'app doit le dire (sur iPhone, elle existe).
  const hasVoice = await page.evaluate(() => 'speechSynthesis' in window);
  if (hasVoice) {
    await page.getByRole('button', { name: 'Tester la voix' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.lastSpeech)).toContain('1 kilomètre');
  } else {
    await expect(page.getByText('La synthèse vocale n’est pas disponible sur ce navigateur.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tester la voix' })).toBeDisabled();
  }
});

test('captures phase A (sombre et clair)', async ({ page }) => {
  test.setTimeout(180_000);
  await mockOpenMeteo(page);
  await completeOnboarding(page);
  await importGpx(page);
  await expect(page.getByRole('heading', { name: 'Sortie du matin' })).toBeVisible();
  const detailUrl = page.url();
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
    }
    await page.goto(detailUrl);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/pA-detail-${theme}.png`, fullPage: true });
    await page.goto('./#/course');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/pA-course-${theme}.png`, fullPage: true });
    await page.goto('./#/course/forme');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screenshots/pA-forme-${theme}.png`, fullPage: true });
    await page.goto('./#/course/carte');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/pA-carte-${theme}.png` });
    await page.goto('./#/course/seances');
    await page.screenshot({ path: `screenshots/pA-seances-${theme}.png`, fullPage: true });
  }
});
