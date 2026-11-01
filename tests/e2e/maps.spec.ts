import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

/** Boucle réaliste (5 km env.) avec une première moitié rapide et une seconde lente. */
function gpx(name = 'Corniche') {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 2);
  start.setUTCHours(7, 0, 0, 0);
  const pts: string[] = [];
  let t = start.getTime();
  for (let i = 0; i < 900; i++) {
    const a = (i / 900) * Math.PI * 2;
    const lat = 33.595 + 0.006 * Math.sin(a);
    const lng = -7.665 + 0.012 * Math.cos(a) * (1 + 0.15 * Math.sin(3 * a));
    t += i < 450 ? 1500 : 2600;
    pts.push(`<trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${(20 + 15 * Math.sin(a)).toFixed(1)}</ele><time>${new Date(t).toISOString()}</time></trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

async function importRun(page: Page) {
  await page.route(/open-meteo\.com/, (r) => r.fulfill({ json: {} }));
  await page.goto('./#/course');
  await page.getByRole('button', { name: /Importer/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'c.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx()) });
  await page.getByRole('dialog').getByRole('button', { name: 'Importer cette course' }).click();
  await expect(page.getByRole('heading', { name: 'Corniche' })).toBeVisible({ timeout: 60_000 });
}

type MapEl = HTMLElement & {
  __map?: {
    getStyle: () => { name?: string; layers: { id: string }[] };
    project: (c: [number, number]) => { x: number; y: number };
    getCanvas: () => HTMLCanvasElement;
  };
};

const styleName = (page: Page) => page.evaluate(() => (document.querySelector('[data-testid=run-map]') as MapEl | null)?.__map?.getStyle()?.name ?? '');

test('carte MapLibre : tracé, km, départ/arrivée, attribution, thème, relief', async ({ page }) => {
  test.setTimeout(150_000);
  await completeOnboarding(page);
  await importRun(page);
  const map = page.getByTestId('run-map');
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(map.locator('.fp-km')).toHaveCount(5, { timeout: 20_000 });
  await expect(map.locator('.fp-start')).toHaveCount(1);
  await expect(map.locator('.fp-finish')).toHaveCount(1);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await expect(page.getByRole('link', { name: '© OpenStreetMap' }).first()).toBeVisible();
  await expect.poll(() => styleName(page), { timeout: 20_000 }).toMatch(/dark/i);
  const layers = await page.evaluate(() => (document.querySelector('[data-testid=run-map]') as MapEl).__map!.getStyle().layers.map((l) => l.id));
  expect(layers).toEqual(expect.arrayContaining(['route-casing', 'route-line', 'route-gaps']));
  await page.getByRole('button', { name: 'Relief' }).click();
  await expect.poll(() => page.evaluate(() => (document.querySelector('[data-testid=run-map]') as MapEl).__map!.getStyle().layers.some((l) => l.id === 'hillshade'))).toBe(true);
  const url = page.url();
  await page.goto('./#/parametres');
  await page.getByRole('radio', { name: 'Clair' }).click();
  await page.goto(url);
  await expect.poll(() => styleName(page), { timeout: 20_000 }).toMatch(/positron/i);
});

test('toucher le tracé : info-bulle distance / allure / altitude', async ({ page }) => {
  test.setTimeout(150_000);
  await completeOnboarding(page);
  await importRun(page);
  await expect(page.getByTestId('run-map').locator('.fp-km')).toHaveCount(5, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const pt = await page.evaluate(() => {
    const m = (document.querySelector('[data-testid=run-map]') as MapEl).__map!;
    const a = (180 / 900) * Math.PI * 2;
    const p = m.project([-7.665 + 0.012 * Math.cos(a) * (1 + 0.15 * Math.sin(3 * a)), 33.595 + 0.006 * Math.sin(a)]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.touchscreen.tap(pt.x, pt.y);
  const popup = page.locator('.fp-popup');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('km');
  await expect(popup).toContainText(/Allure \d+:\d{2} \/km/);
  await expect(popup).toContainText(/Altitude \d+ m/);
});

test('fond indisponible (hors-ligne) : tracé sur fond neutre', async ({ page }) => {
  test.setTimeout(150_000);
  await page.route(/openfreemap\.org/, (r) => r.abort());
  await completeOnboarding(page);
  await importRun(page);
  await expect(page.getByText('Hors-ligne : fond de carte indisponible, tracé seul.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('run-map').locator('.fp-km')).toHaveCount(5);
});

test('carte en direct (halo, recentrer), heatmap, mini-cartes canvas', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await importRun(page);
  await page.goto('./#/course/activites');
  await expect(page.getByTestId('activity-row').first().getByRole('img', { name: 'Parcours' })).toHaveAttribute('src', /^data:image\/png/);
  await page.goto('./#/course/carte');
  await expect(page.getByTestId('heatmap').locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
  await page.goto('./#/course/gps');
  await page.getByLabel(/^Pause automatique/).uncheck();
  await page.getByRole('button', { name: 'Démarrer' }).click();
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(1000);
    await context.setGeolocation({ latitude: 33.5 + i * 0.00004, longitude: -7.6, accuracy: 5 });
  }
  const live = page.getByTestId('run-map');
  await expect(live.locator('.fp-pos')).toBeVisible({ timeout: 30_000 });
  const b = (await live.boundingBox())!;
  // Geste de l'utilisateur (le WebKit mobile de Playwright ne simule pas le glisser au doigt) :
  // déplacement de la carte avec un événement d'origine, comme le ferait un vrai geste.
  expect(b.width).toBeGreaterThan(100);
  await page.evaluate(() => {
    const m = (document.querySelector('[data-testid=run-map]') as HTMLElement & { __map?: { panBy: (o: [number, number], a: object, e: object) => void } }).__map!;
    m.panBy([120, 60], { duration: 0 }, { originalEvent: new Event('touchmove') });
  });
  await page.getByTestId('recenter').click();
  await expect(page.getByTestId('recenter')).toHaveCount(0);
});

test('captures cartes après (clair et sombre)', async ({ page }) => {
  test.setTimeout(200_000);
  await completeOnboarding(page);
  await importRun(page);
  const url = page.url();
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
    }
    await page.goto(url);
    await page.getByRole('heading', { name: 'Parcours' }).scrollIntoViewIfNeeded();
    // Capture une fois la carte entièrement dessinée (style, tuiles, tracé).
    await expect.poll(() => page.evaluate(() => (document.querySelector('[data-testid=run-map]') as (HTMLElement & { __map?: { loaded: () => boolean; areTilesLoaded: () => boolean } }) | null)?.__map?.areTilesLoaded() ?? false), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(1500);
    await page.getByRole('heading', { name: 'Parcours' }).locator('xpath=ancestor::section').screenshot({ path: `screenshots/carte-apres-detail-${theme}.png` });
    await page.goto('./#/course/carte');
    await expect.poll(() => page.evaluate(() => (document.querySelector('[data-testid=heatmap]') as (HTMLElement & { __map?: { areTilesLoaded: () => boolean } }) | null)?.__map?.areTilesLoaded() ?? false), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/carte-apres-heatmap-${theme}.png` });
  }
});
