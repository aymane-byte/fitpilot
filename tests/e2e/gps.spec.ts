import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

/** GPX de 5 km en ligne droite vers le nord, départ il y a `daysAgo` jours, `secPerPoint` s entre points (6 m). */
function gpx(name: string, daysAgo: number, secPerPoint = 2) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysAgo);
  start.setUTCHours(7, 0, 0, 0);
  const dLat = 6 / 111_195;
  const pts = Array.from({ length: 834 }, (_, i) => `<trkpt lat="${(33.5 + i * dLat).toFixed(7)}" lon="-7.6"><ele>20</ele><time>${new Date(start.getTime() + i * secPerPoint * 1000).toISOString()}</time></trkpt>`);
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

async function importGpx(page: Page, content: string, name: string) {
  await page.route(/open-meteo\.com/, (route) => route.fulfill({ json: {} }));
  await page.goto('./#/course');
  await page.getByRole('button', { name: /Importer/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'run.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(content) });
  await page.getByRole('dialog').getByRole('button', { name: 'Importer cette course' }).click();
  // WebKit de test : IndexedDB lent ; on attend la page de la course importée.
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 60_000 });
}

/** Déplacement vers le nord de `m` mètres par seconde pendant `n` secondes. */
async function move(context: BrowserContext, from: number, n: number, m: number) {
  let lat = from;
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    lat += m / 111_195;
    await context.setGeolocation({ latitude: lat, longitude: -7.6, accuracy: 5 });
  }
  return lat;
}

test('pause automatique au feu rouge puis reprise ; écran d’enregistrement', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await page.goto('./#/course/gps');
  await expect(page.getByLabel(/^Pause automatique/)).toBeChecked();
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await expect(page.getByTestId('keep-on')).toContainText('Garde l’écran allumé');
  let lat = await move(context, 33.5, 20, 4);
  // Arrêt : le GPS continue d'envoyer des positions qui bougent d'1 m (bruit).
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(1000);
    await context.setGeolocation({ latitude: lat + (i % 2 ? 1 : 0) / 111_195, longitude: -7.6, accuracy: 5 });
  }
  await expect(page.getByTestId('auto-paused')).toBeVisible();
  const frozen = await page.getByTestId('gps-time').innerText();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('gps-time')).toHaveText(frozen); // le chrono ne tourne plus
  // On repart : reprise automatique.
  lat = await move(context, lat, 15, 4);
  await expect(page.getByTestId('auto-paused')).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.getByRole('button', { name: 'Enregistrer la course' }).click();
  await expect(page.getByRole('heading', { name: 'Parcours' })).toBeVisible();
  // Environ 35 s en mouvement pour ~52 s écoulées : l'arrêt (≈ 14 s) n'est pas compté.
  const dur = await page.getByText('Durée').locator('..').innerText();
  const sec = Number(dur.match(/(\d+):(\d+)/)![1]) * 60 + Number(dur.match(/(\d+):(\d+)/)![2]);
  expect(sec).toBeLessThan(44);
  expect(sec).toBeGreaterThan(25);
});

test('app fermée en pleine course : bannière, puis reprendre ou enregistrer', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await page.goto('./#/course/gps');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await move(context, 33.5, 25, 5);
  // Fermeture brutale puis réouverture sur l'accueil.
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByTestId('draft-banner')).toContainText('Course GPS non terminée');
  await page.getByTestId('draft-banner').click();
  const dialog = page.getByRole('dialog', { name: 'Course non terminée' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Terminer et enregistrer' }).click();
  await page.getByRole('button', { name: 'Enregistrer la course' }).click();
  await expect(page.getByText('Parcours').first()).toBeVisible();
  await page.goto('./#/');
  await expect(page.getByTestId('draft-banner')).toHaveCount(0);
});

test('historique : mini-cartes, filtres et tri ; parcours favori ; renommer et recadrer', async ({ page }) => {
  test.setTimeout(240_000);
  await completeOnboarding(page);
  await importGpx(page, gpx('Corniche lente', 20, 2), 'Corniche lente');
  await importGpx(page, gpx('Corniche rapide', 2, 1.6), 'Corniche rapide');
  // Course manuelle (sans tracé)
  await page.goto('./#/course');
  await page.getByRole('button', { name: 'Saisir une course' }).click();
  await page.getByLabel('Distance').fill('3');
  await page.getByLabel('Durée').fill('18');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Course enregistrée')).toBeVisible();

  await page.goto('./#/course/activites');
  await expect(page.getByTestId('activity-row')).toHaveCount(3);
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Corniche lente' }).getByRole('img', { name: 'Parcours' })).toBeVisible();
  await expect(page.getByTestId('activity-row').filter({ hasText: 'Footing' }).first().getByRole('img')).toHaveCount(0);
  await page.getByLabel('Trier').selectOption('pace');
  await expect(page.getByTestId('activity-row').first()).toContainText('Corniche rapide');
  await page.getByRole('radio', { name: 'Semaine' }).click();
  await expect(page.getByTestId('activities-count')).not.toContainText('3 activités');

  // Parcours favori depuis la course lente, puis comparaison.
  await page.getByRole('radio', { name: 'Tout' }).click();
  await page.getByTestId('activity-row').filter({ hasText: 'Corniche lente' }).click();
  await page.getByRole('button', { name: 'Parcours favori' }).click();
  await page.getByLabel('Nom du parcours').fill('Corniche');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Corniche' })).toBeVisible();
  await expect(page.getByTestId('route-runs').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('route-runs').getByRole('listitem').first()).toContainText('22:13'); // 833 intervalles × 1,6 s
  await expect(page.getByTestId('route-runs')).toContainText('sur le record');

  // Renommer
  await page.getByTestId('route-runs').getByRole('listitem').last().click();
  await expect(page.getByTestId('route-rank')).toContainText('2e temps sur 2');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Nom de l’activité').fill('Corniche du dimanche');
  await page.getByLabel('Notes').fill('Vent de face au retour');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Corniche du dimanche' })).toBeVisible();
  await expect(page.getByText('Vent de face au retour')).toBeVisible();

  // Recadrer : on retire le premier km.
  await page.getByRole('button', { name: 'Recadrer' }).click();
  await page.getByRole('dialog').getByLabel(/^Début/).fill('1000');
  await expect(page.getByTestId('crop-result')).toContainText(/Résultat : 4 km|Résultat : 3,9/);
  await page.getByRole('dialog').getByRole('button', { name: 'Recadrer' }).click();
  await expect(page.getByText('Course recadrée')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^4 km$|^3,99 km$|^4,0\d km$/).first()).toBeVisible();
  await expect(page.getByText('(recadrée)')).toBeVisible();
});

test('captures GPS (sombre)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await importGpx(page, gpx('Sortie du matin', 3), 'Sortie du matin');
  await page.goto('./#/course/activites');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/gps-activites.png', fullPage: true });
  await page.goto('./#/course/gps');
  await page.getByRole('button', { name: 'Démarrer' }).click();
  await move(context, 33.5, 6, 4);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/gps-enregistrement.png' });
});
