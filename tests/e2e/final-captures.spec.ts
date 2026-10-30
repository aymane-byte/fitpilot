import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('captures finales (clair et sombre)', async ({ page }) => {
  test.setTimeout(120_000);
  await completeOnboarding(page);
  // Un repas pour remplir le tableau de bord
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Ajouter au déjeuner' }).click();
  await page.getByRole('dialog').getByPlaceholder('Rechercher un aliment').fill('tajine de poulet');
  await page.getByRole('dialog').getByRole('button', { name: /Tajine de poulet/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
    }
    await page.goto('./#/');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/final-${theme}-dashboard.png`, fullPage: true });
    await page.goto('./#/nutrition');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/final-${theme}-nutrition.png` });
    await page.goto('./#/coach');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/final-${theme}-coach.png` });
    await page.goto('./#/parametres');
    await page.getByRole('radio', { name: 'Gemini' }).click();
    await page.screenshot({ path: `screenshots/final-${theme}-settings-coach.png`, fullPage: true });
  }
});
