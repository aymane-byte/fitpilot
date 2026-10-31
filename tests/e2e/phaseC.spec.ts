import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

async function addManualRun(page: Page, km: string, duration: string) {
  await page.goto('./#/course');
  await page.getByRole('button', { name: 'Saisir une course' }).click();
  await page.getByLabel('Distance').fill(km);
  await page.getByLabel('Durée').fill(duration);
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Course enregistrée')).toBeVisible();
}

async function wornShoe(page: Page) {
  await page.goto('./#/course/chaussures');
  await page.getByRole('button', { name: 'Ajouter une paire' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nom').fill('Pegasus');
  await d.getByLabel('Km déjà parcourus').fill('720');
  await d.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('shoe-row')).toContainText('À remplacer');
}

test('tableau de bord : charge, VDOT, chaussures, micronutriments, Ramadan', async ({ page }) => {
  test.setTimeout(120_000);
  await completeOnboarding(page);
  await addManualRun(page, '5', '25:00');
  await wornShoe(page);
  // Aliment avec micronutriments (aliment fourni, valeurs CIQUAL).
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Ajouter au déjeuner' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('lentilles');
  await page.getByRole('dialog').getByRole('button', { name: /^Lentilles cuites/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.goto('./#/parametres');
  await page.getByLabel(/^Mode Ramadan/).check();
  await page.getByRole('button', { name: 'Enregistrer' }).last().click();
  await page.goto('./#/');
  const card = page.getByTestId('run-insights');
  await expect(card).toContainText('Forme');
  await expect(card).toContainText('VDOT estimé');
  await expect(card).toContainText('Pegasus : 720 km, pense à les remplacer.');
  await expect(page.getByTestId('micros-line')).toContainText('Fibres');
  await expect(page.getByTestId('ramadan-card')).toContainText('Jeûne');
});

test('coach par règles : chaussures, charge et micronutriments dans les réponses', async ({ page }) => {
  test.setTimeout(120_000);
  await completeOnboarding(page);
  await addManualRun(page, '5', '25:00');
  await wornShoe(page);
  await page.goto('./#/coach');
  await page.getByRole('button', { name: 'Analyse ma semaine' }).click();
  await expect(page.getByText(/Charge d’entraînement/).last()).toBeVisible();
  await page.getByPlaceholder('Pose ta question…').fill('Mes chaussures sont usées ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(/Chaussures « Pegasus » : 720 km/)).toBeVisible();
  await page.getByPlaceholder('Pose ta question…').fill('Quelle est ma charge et mon VDOT ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(/VDOT estimé/).last()).toBeVisible();
});

test('captures finales A+B+C (sombre et clair)', async ({ page }) => {
  test.setTimeout(150_000);
  await completeOnboarding(page);
  await addManualRun(page, '6', '33:00');
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Ajouter au déjeuner' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('lentilles');
  await page.getByRole('dialog').getByRole('button', { name: /^Lentilles cuites/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
    }
    await page.goto('./#/');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `screenshots/pC-dashboard-${theme}.png`, fullPage: true });
    await page.goto('./#/coach');
    await page.getByRole('button', { name: 'Analyse ma semaine' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `screenshots/pC-coach-${theme}.png`, fullPage: true });
  }
});
