import { expect, type Page } from '@playwright/test';

export async function completeOnboarding(page: Page, name = 'Aymane') {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Bienvenue sur FitPilot' })).toBeVisible();
  await page.getByRole('button', { name: 'Créer mon profil' }).click();

  // Étape 1 : le prénom est obligatoire.
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('Indique ton prénom')).toBeVisible();
  await page.getByLabel('Prénom').fill(name);
  // Valeurs pré-remplies
  await expect(page.getByLabel('Taille')).toHaveValue('170');
  await expect(page.getByLabel('Poids actuel')).toHaveValue('78');
  await page.getByLabel(/Poids cible/).fill('74');
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape 2 : objectif pré-sélectionné
  await expect(page.getByRole('radio', { name: /Recomposition/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Suivant' }).click();
  // Étapes 3 et 4
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByLabel('Compléments')).toHaveValue('Créatine monohydrate');
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Résumé : 78 kg, 170 cm, 20 ans, modéré, recomposition → 2440 kcal, 156 g protéines
  await expect(page.getByText(/2\s?440/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Comment c’est calculé ?' }).click();
  await expect(page.getByText(/= 1\s?748 kcal/)).toBeVisible();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('heading', { name: `Bonjour ${name}` })).toBeVisible();
}
