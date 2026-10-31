import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('séance de muscu : démarrer, valider des séries, terminer', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('link', { name: 'Muscu', exact: true }).click();
  // Plan conseillé pour 3 muscu + 2 courses : première séance « Haut du corps »
  await expect(page.getByText('Prochaine séance du plan · Muscu 3 j + Course 2 j')).toBeVisible();
  await page.getByRole('button', { name: /Haut du corps/ }).click();

  await expect(page.getByRole('heading', { name: 'Haut du corps' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Développé couché' })).toBeVisible();
  await page.getByLabel('Série 1 kg').first().fill('60');
  await page.getByLabel('Série 1 reps').first().fill('6');
  await page.getByRole('button', { name: 'Valider la série' }).first().click();
  // Le minuteur de repos démarre
  await expect(page.getByRole('timer')).toContainText('Repos');
  await page.getByRole('button', { name: 'Passer' }).click();
  await page.getByLabel('Série 2 kg').first().fill('60');
  await page.getByRole('button', { name: 'Valider la série' }).first().click();

  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('dialog')).toContainText('2 séries validées');
  await page.getByRole('dialog').getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('dialog', { name: 'Séance enregistrée' })).toContainText('720 kg'); // 60 × 6 × 2
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).last().click();

  // Historique + records + prochaine séance du plan
  await expect(page.getByRole('link', { name: /Haut du corps.*2 séries/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bas du corps/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Records' }).click();
  await expect(page.getByText('60 kg × 6')).toBeVisible();

  // La séance suivante sur cet exercice propose une charge (surcharge progressive)
  await page.goto('./#/muscu/exercice/1');
  await expect(page.getByText('1RM estimé')).toBeVisible();
});

test('bibliothèque d’exercices : recherche et fiche', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/muscu?tab=library');
  await page.getByPlaceholder('Rechercher un exercice').fill('squat');
  await page.getByRole('button', { name: /Squat barre/ }).click();
  await expect(page.getByRole('heading', { name: 'Squat barre' })).toBeVisible();
  await expect(page.getByText('Erreurs fréquentes')).toBeVisible();
  await expect(page.getByText('Quadriceps')).toBeVisible();
});

test('course manuelle : allure, historique, records', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Saisir une course' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Distance').fill('5');
  await dialog.getByLabel('Durée').fill('27:30');
  await expect(dialog).toContainText('5:30/km');
  await expect(dialog).toContainText('390 kcal'); // 78 kg × 5 km, estimation
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('5 km · 27:30')).toBeVisible();
  await expect(page.getByText('allure moyenne ·').first()).toBeVisible();
});

test('course manuelle irréaliste refusée', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/course');
  await page.getByRole('button', { name: 'Saisir une course' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Distance').fill('10');
  await dialog.getByLabel('Durée').fill('15');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText(/Allure irréaliste/)).toBeVisible();
});

test('course GPS simulée : départ, points, enregistrement', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.5, longitude: -7.6, accuracy: 5 });
  await completeOnboarding(page);
  await page.goto('./#/course/gps');
  await expect(page.getByText(/Précision GPS/)).toBeVisible();
  await page.getByRole('button', { name: 'Démarrer' }).click();
  // ~6,7 m toutes les 1,2 s ≈ 5,6 m/s : vitesse de course crédible. 16 positions → ~100 m.
  for (let i = 1; i <= 16; i++) {
    await page.waitForTimeout(1200);
    await context.setGeolocation({ latitude: 33.5 + i * 0.00006, longitude: -7.6, accuracy: 5 });
  }
  await page.waitForTimeout(800);
  const km = Number((await page.getByTestId('gps-distance').innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
  expect(km).toBeGreaterThan(0.07);
  expect(km).toBeLessThan(0.12);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.getByRole('button', { name: 'Enregistrer la course' }).click();
  await expect(page.getByRole('heading', { name: 'Parcours' })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('planning : semaine générée sans conflit, alerte si course après jambes', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/planning');
  // Semaine suivante : complète quel que soit le jour où le test tourne.
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await page.getByRole('button', { name: 'Générer ma semaine' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Générer ma semaine' }).click();
  await expect(page.getByText('Semaine générée')).toBeVisible();
  await expect(page.getByRole('button', { name: /Haut du corps/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bas du corps/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Footing facile/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sortie longue/ })).toBeVisible();
  await expect(page.getByText(/juste après une séance de jambes/)).toHaveCount(0);

  // Déplacer « Footing facile » au lendemain de « Bas du corps » (mercredi → jeudi) déclenche l'alerte
  await page.getByRole('button', { name: /Footing facile/ }).click();
  const dialog = page.getByRole('dialog');
  const days = dialog.getByLabel('Jour');
  const thursday = await days.locator('option').nth(3).getAttribute('value');
  await days.selectOption(thursday!);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText(/juste après une séance de jambes/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Enregistrer quand même' }).click();
  await expect(page.getByText(/juste après une séance de jambes/)).toBeVisible();
});

test('captures phase 2', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/planning');
  // Semaine suivante : complète quel que soit le jour où le test tourne.
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await page.getByRole('button', { name: 'Générer ma semaine' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Générer ma semaine' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/p2-planning.png', fullPage: true });
  await page.goto('./#/muscu');
  await page.getByRole('button', { name: /Haut du corps/ }).click();
  await page.getByRole('button', { name: 'Valider la série' }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/p2-live.png' });
  await page.goto('./#/muscu?tab=programs');
  await expect(page.getByText('Muscu 3 j + Course 2 j')).toBeVisible();
  await page.screenshot({ path: 'screenshots/p2-programs.png' });
  await page.goto('./#/course');
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/p2-course.png', fullPage: true });
  await page.goto('./#/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/p2-dashboard.png', fullPage: true });
});
