import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('noter un repas avec une unité maison (khobz)', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('link', { name: 'Nutrition', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter au déjeuner' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Rechercher un aliment').fill('khobz');
  await dialog.getByRole('button', { name: /Khobz \(pain marocain\)/ }).click();
  await expect(dialog.getByText(/La recette varie/)).toBeVisible(); // valeurs estimées signalées
  await dialog.getByRole('radio', { name: /quart de khobz/ }).click();
  await dialog.getByLabel('Quantité').fill('2');
  await expect(dialog.getByText('= 180 g')).toBeVisible();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();
  // 265 kcal × 1,8 = 477 kcal
  await expect(page.getByText('2 × quart de khobz (180 g)', { exact: false })).toBeVisible();
  await expect(page.getByText('477').first()).toBeVisible();
  // Tableau de bord : kcal restantes = 2440 − 477
  await page.getByRole('link', { name: 'Accueil' }).click();
  await expect(page.getByTestId('kcal-left')).toHaveText('1 963'.replace(' ', ' '));
});

test('alerte allergie et recherche sans accents', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/profil');
  await page.getByLabel('Allergies').fill('arachides');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Profil enregistré')).toBeVisible();
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Ajouter au goûter' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Rechercher un aliment').fill('cacahuete');
  await dialog.getByRole('button', { name: /Cacahuètes/ }).click();
  await expect(dialog.getByText(/contient de l’arachide/)).toBeVisible();
});

test('copier le repas d’hier', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Jour précédent' }).click();
  await page.getByRole('button', { name: 'Ajouter au petit-déjeuner' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Rechercher un aliment').fill('oeuf entier');
  await dialog.getByRole('button', { name: /Œuf entier/ }).click();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await page.getByRole('button', { name: 'Jour suivant' }).click();
  await page.getByRole('button', { name: 'Copier d’hier' }).click();
  await expect(page.getByText('Repas copié')).toBeVisible();
  await expect(page.getByText('Œuf entier')).toBeVisible();
});

test('créer une recette et l’ajouter', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/nutrition?tab=recipes');
  await page.getByRole('button', { name: 'Nouvelle recette' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom de la recette').fill('Riz au poulet');
  await dialog.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
  await dialog.getByPlaceholder('Rechercher un aliment').fill('riz');
  await dialog.getByRole('button', { name: /Riz blanc cuit/ }).click();
  await dialog.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
  await dialog.getByPlaceholder('Rechercher un aliment').fill('blanc de poulet');
  await dialog.getByRole('button', { name: /Blanc de poulet/ }).click();
  // 180 g de riz (234 kcal) + 150 g de poulet (248 kcal) = 482 kcal / 330 g = 146 kcal / 100 g
  await expect(dialog.getByText(/146 kcal/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Recette enregistrée')).toBeVisible();
  await page.getByRole('radio', { name: 'Aliments' }).click();
  await page.getByPlaceholder('Rechercher un aliment').fill('riz au poulet');
  await expect(page.getByRole('button', { name: /Riz au poulet/ })).toBeVisible();
});

test('captures phase 3', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/nutrition');
  await page.getByRole('button', { name: 'Ajouter au petit-déjeuner' }).click();
  await page.getByRole('dialog').getByPlaceholder('Rechercher un aliment').fill('msemen');
  await page.getByRole('dialog').getByRole('button', { name: /Msemen/ }).click();
  await page.screenshot({ path: 'screenshots/p3-portion.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click();
  await page.screenshot({ path: 'screenshots/p3-journal.png', fullPage: true });
  await page.goto('./#/nutrition?tab=foods');
  await page.screenshot({ path: 'screenshots/p3-foods.png' });
});
