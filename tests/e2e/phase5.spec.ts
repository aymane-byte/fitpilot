import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('mesures : saisie, courbe et historique', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/plus');
  await page.getByRole('link', { name: /Progrès & photos/ }).click();
  for (const [date, waist] of [['2026-10-01', '86'], ['2026-10-15', '85']]) {
    await page.getByRole('button', { name: 'Nouvelles mesures' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Date').fill(date);
    await dialog.getByLabel('Taille').fill(waist);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByText('−1 cm')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Taille' })).toBeVisible(); // courbe
  // Valeur hors limites refusée
  await page.getByRole('button', { name: 'Nouvelles mesures' }).click();
  await page.getByRole('dialog').getByLabel('Bras').fill('500');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog').getByText(/hors limites/)).toBeVisible();
});

test('photos : compression locale, comparaison, sauvegarde avec photos', async ({ page }) => {
  await completeOnboarding(page, 'Photos');
  await page.goto('./#/progres');
  await page.getByTestId('photo-file').setInputFiles('tests/e2e/fixtures/photo-before.jpg');
  await expect(page.getByText('Photo enregistrée')).toBeVisible();
  await page.getByTestId('photo-file').setInputFiles('tests/e2e/fixtures/photo-after.jpg');
  await expect(page.getByRole('button', { name: /Face/ })).toHaveCount(2);
  // Compressée : côté le plus long ≤ 1280 px
  const size = await page.evaluate(async () => {
    const req = indexedDB.open('fitpilot');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all: { bytes: ArrayBuffer; type: string }[] = await new Promise((r) => {
      const q = db.transaction('progressPhotos').objectStore('progressPhotos').getAll();
      q.onsuccess = () => r(q.result);
    });
    db.close(); // sinon la connexion bloque « Tout effacer » plus loin
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([all[0].bytes], { type: all[0].type }));
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight, type: all[0].type };
  });
  expect(size.h).toBeLessThanOrEqual(1280);
  expect(size.type).toBe('image/jpeg');

  await page.getByRole('button', { name: 'Comparer avant / après' }).click();
  await expect(page.getByRole('slider', { name: 'Curseur de comparaison' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();

  // Sauvegarde AVEC photos puis restauration après effacement
  await page.goto('./#/parametres');
  await page.getByLabel(/Inclure les photos de progrès/).click();
  await expect(page.getByLabel(/Inclure les photos de progrès/)).toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const file = await (await download).path();
  await page.getByRole('button', { name: 'Effacer toutes les données' }).click();
  await page.getByRole('button', { name: 'Oui, tout effacer' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue sur FitPilot' })).toBeVisible();
  await page.getByTestId('backup-file').setInputFiles(file!);
  await expect(page.getByRole('dialog')).toContainText('Photos');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Photos' })).toBeVisible({ timeout: 20_000 });
  await page.goto('./#/progres');
  await expect(page.getByRole('button', { name: /Face/ })).toHaveCount(2);
});

test('rapport hebdo : statistiques, résumé par règles, PDF', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course');
  await page.getByRole('button', { name: 'Saisir une course' }).click();
  await page.getByRole('dialog').getByLabel('Distance').fill('6');
  await page.getByRole('dialog').getByLabel('Durée').fill('33:00');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto('./#/rapports');
  await expect(page.getByRole('main').getByText('6 km', { exact: true })).toBeVisible();
  await expect(page.getByText('5:30 /km')).toBeVisible();
  await page.getByRole('button', { name: 'Générer le résumé' }).click();
  await expect(page.getByTestId('summary-provider')).toHaveText('Analyse par règles locale (pas une IA)');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter en PDF' }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toMatch(/^fitpilot-rapport-\d{4}-\d{2}-\d{2}\.pdf$/);
  const head = (await (await import('node:fs/promises')).readFile((await pdf.path())!)).subarray(0, 5).toString();
  expect(head).toBe('%PDF-');

  await page.getByRole('radio', { name: 'Mois' }).click();
  await expect(page.getByRole('main').getByText('6 km', { exact: true })).toBeVisible();
});

test('captures phase 5', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/progres');
  await page.getByTestId('photo-file').setInputFiles('tests/e2e/fixtures/photo-before.jpg');
  await expect(page.getByText('Photo enregistrée')).toBeVisible();
  await page.screenshot({ path: 'screenshots/p5-progress.png', fullPage: true });
  await page.goto('./#/rapports');
  await expect(page.getByText('Poids moyen')).toBeVisible();
  await page.screenshot({ path: 'screenshots/p5-report.png', fullPage: true });
  await page.goto('./#/coach');
  await page.getByRole('button', { name: 'Analyse ma semaine' }).click();
  await expect(page.getByText('Bilan de la semaine').first()).toBeVisible();
  await page.screenshot({ path: 'screenshots/p4-coach.png' });
});
