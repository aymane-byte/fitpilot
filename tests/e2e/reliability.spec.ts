import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

const dLat = (m: number) => m / 111_195;

async function move(page: Page, context: BrowserContext, from: number, n: number, m: number) {
  let lat = from;
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(1000);
    lat += dLat(m);
    await context.setGeolocation({ latitude: lat, longitude: -7.6, accuracy: 5 });
  }
  return lat;
}

const seconds = (txt: string) => txt.split(':').map(Number).reduce((s, v) => s * 60 + v, 0);

async function startRun(page: Page, context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await page.goto('./#/course/gps');
  await expect(page.getByTestId('start-warning')).toContainText('Ne verrouille pas l’écran');
  await page.getByLabel(/^Pause automatique/).uncheck(); // isoler le test des trous de la pause auto
  await page.getByRole('button', { name: 'Démarrer' }).click();
}

test('chrono sur horodatages + trou GPS de 6 min (horloge simulée) : garder puis retirer', async ({ page, context }) => {
  test.setTimeout(150_000);
  await page.clock.install();
  await startRun(page, context);
  let lat = await move(page, context, 33.5, 12, 4);
  // Écran verrouillé 6 minutes : plus aucune position, l'horloge avance d'un coup.
  await page.clock.fastForward('06:00');
  await expect(page.getByText(/GPS interrompu depuis 6 min/)).toBeVisible();
  // Le chrono est juste sans avoir « tourné » : ≥ 6 min 12 s.
  expect(seconds(await page.getByTestId('gps-time').innerText())).toBeGreaterThanOrEqual(372);
  // Retour du signal 1 km plus loin.
  lat += dLat(1000);
  await context.setGeolocation({ latitude: lat, longitude: -7.6, accuracy: 5 });
  const card = page.getByTestId('gap-card');
  await expect(card).toContainText('GPS interrompu pendant 6 min');
  await expect(card).toContainText('1 km');
  const kmBefore = Number((await page.getByTestId('gps-distance').innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
  expect(kmBefore).toBeGreaterThan(1);
  // Retirer la partie estimée : distance et temps de l'interruption exclus.
  await card.getByRole('button', { name: 'Retirer cette partie' }).click();
  await expect(card).toHaveCount(0);
  const kmAfter = Number((await page.getByTestId('gps-distance').innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
  expect(kmAfter).toBeLessThan(0.1);
  expect(seconds(await page.getByTestId('gps-time').innerText())).toBeLessThan(60);
});

test('trou GPS gardé : pointillés sur la carte et distance estimée dans le détail', async ({ page, context }) => {
  test.setTimeout(150_000);
  await page.clock.install();
  await startRun(page, context);
  let lat = await move(page, context, 33.5, 30, 4);
  await page.clock.fastForward('04:00');
  lat += dLat(800);
  await context.setGeolocation({ latitude: lat, longitude: -7.6, accuracy: 5 });
  await page.getByTestId('gap-card').getByRole('button', { name: 'Garder la ligne estimée' }).click();
  lat = await move(page, context, lat, 6, 4);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.getByRole('button', { name: 'Enregistrer la course' }).click();
  await expect(page.getByTestId('gaps-card')).toContainText('4 min sans GPS');
  await expect(page.getByText('Distance estimée')).toBeVisible();
  // Couche en pointillés présente sur la carte.
  await expect.poll(() => page.evaluate(() => {
    const el = document.querySelector('[data-testid=run-map]') as (HTMLElement & { __map?: { getSource: (id: string) => { serialize: () => { data: { features: unknown[] } } } | undefined } }) | null;
    return el?.__map?.getSource('gaps')?.serialize().data.features.length ?? -1;
  }), { timeout: 20_000 }).toBe(1);
  // Retrait après coup.
  await page.getByTestId('gaps-card').getByRole('button', { name: 'Retirer cette partie' }).click();
  await expect(page.getByTestId('gaps-card')).toHaveCount(0, { timeout: 30_000 });
});

test('app rechargée en pleine course : reprise automatique depuis IndexedDB', async ({ page, context }) => {
  test.setTimeout(120_000);
  await startRun(page, context);
  await move(page, context, 33.5, 12, 4);
  await page.waitForTimeout(5500); // laisse passer une sauvegarde
  const before = seconds(await page.getByTestId('gps-time').innerText());
  await page.reload();
  await expect(page.getByText('Course reprise automatiquement')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(seconds(await page.getByTestId('gps-time').innerText())).toBeGreaterThanOrEqual(before);
  const stored = await page.evaluate(async () => {
    const req = indexedDB.open('fitpilot');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const n: number = await new Promise((r) => {
      const q = db.transaction('livePoints').objectStore('livePoints').count();
      q.onsuccess = () => r(q.result);
    });
    db.close();
    return n;
  });
  expect(stored).toBeGreaterThan(5);
});

test('mode poche : écran noir, touchers bloqués, déverrouillage par appui long', async ({ page, context }) => {
  test.setTimeout(120_000);
  await startRun(page, context);
  await move(page, context, 33.5, 5, 4);
  await page.getByTestId('keep-on').getByRole('button', { name: 'Mode poche' }).click();
  const pocket = page.getByTestId('pocket-mode');
  await expect(pocket).toBeVisible();
  await expect(pocket).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  // Un toucher bref ne fait rien (le bouton Terminer dessous n'est pas atteint).
  await pocket.click({ position: { x: 200, y: 780 } });
  await expect(pocket).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeAttached();
  // Appui long : déverrouillage.
  const box = (await pocket.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await expect(pocket).toHaveCount(0);
});

test('aide import Strava accessible depuis l’import', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course');
  await page.getByRole('button', { name: /Importer/ }).click();
  await page.getByRole('link', { name: /Importer depuis Strava/ }).click();
  await expect(page.getByRole('heading', { name: 'Importer depuis Strava' })).toBeVisible();
  await expect(page.getByText(/Exporter le GPX/).first()).toBeVisible();
  await expect(page.getByText(/Demander votre archive/)).toBeVisible();
});
