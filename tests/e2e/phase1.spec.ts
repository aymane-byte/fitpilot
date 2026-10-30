import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('onboarding complet puis tableau de bord', async ({ page }) => {
  await completeOnboarding(page);
  await expect(page.getByText('Pesée du matin')).toBeVisible();
  // Le poids de l'onboarding est devenu la première pesée.
  await expect(page.getByText('78').first()).toBeVisible();
  // Rechargement : les données persistent (IndexedDB).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bonjour Aymane' })).toBeVisible();
});

test('ajouter une pesée et de l’eau', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Poids').fill('77,6');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('77,6').first()).toBeVisible();

  await page.getByRole('button', { name: '+500 ml' }).click();
  await page.getByRole('button', { name: '+250 ml' }).click();
  await expect(page.getByTestId('water-total')).toContainText('750');
  await page.getByRole('button', { name: 'Annuler le dernier' }).click();
  await expect(page.getByTestId('water-total')).toContainText('500');
});

test('poids invalide refusé', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Poids').fill('5');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText('Poids entre 30 et 300 kg')).toBeVisible();
});

test('sauvegarde : export puis restauration après effacement', async ({ page }) => {
  await completeOnboarding(page, 'Sauvegarde');
  await page.getByRole('button', { name: '+500 ml' }).click();
  await page.goto('./#/parametres');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const download = await downloadPromise;
  const file = await download.path();
  await expect(page.getByText(/Dernière sauvegarde/)).toBeVisible();

  // Tout effacer
  await page.getByRole('button', { name: 'Effacer toutes les données' }).click();
  await page.getByRole('button', { name: 'Oui, tout effacer' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue sur FitPilot' })).toBeVisible();

  // Restaurer depuis l'écran d'accueil
  await page.getByTestId('backup-file').setInputFiles(file!);
  await expect(page.getByRole('dialog')).toContainText('Profil');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  // La restauration réécrit ~250 lignes : lente dans le WebKit de Playwright sous Windows (~15 ms par écriture).
  await expect(page.getByRole('heading', { name: 'Bonjour Sauvegarde' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('water-total')).toContainText('500');
});

test('import d’un fichier invalide refusé', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('backup-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
  await expect(page.getByText("Ce fichier n'est pas une sauvegarde FitPilot.")).toBeVisible();
});

test('modifier le profil met à jour les objectifs', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('./#/profil');
  await page.getByRole('radio', { name: /Prise de muscle/ }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Profil enregistré')).toBeVisible();
  // TDEE 2709 × 1,1 = 2980
  await expect(page.getByText(/2\s?980/).first()).toBeVisible();
});

test('captures iPhone 390×844 (sombre et clair)', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Bienvenue sur FitPilot' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/dark-00-welcome.png' });
  await completeOnboarding(page);
  for (let d = 6; d >= 1; d--) {
    await page.evaluate(async (days) => {
      const dt = new Date(Date.now() - days * 86_400_000);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('fitpilot');
        req.onsuccess = () => {
          const tx = req.result.transaction('bodyMeasurements', 'readwrite');
          tx.objectStore('bodyMeasurements').add({ date: iso, weightKg: 78.6 - (6 - days) * 0.12 + (days % 2) * 0.2, createdAt: Date.now() - days });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    }, d);
  }
  await page.reload();
  await page.waitForTimeout(800);
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
      await page.goto('./#/');
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `screenshots/${theme}-01-dashboard.png`, fullPage: true });
    await page.goto('./#/profil');
    await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();
    await page.screenshot({ path: `screenshots/${theme}-02-profile.png` });
    await page.goto('./#/parametres');
    await page.screenshot({ path: `screenshots/${theme}-03-settings.png`, fullPage: true });
    await page.goto('./#/installer');
    await page.screenshot({ path: `screenshots/${theme}-04-install.png` });
    await page.goto('./#/muscu');
    await page.screenshot({ path: `screenshots/${theme}-05-phase.png` });
    await page.goto('./#/');
  }
});

test('fonctionne hors-ligne après la première visite', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await expect(page.getByRole('heading', { name: 'Bienvenue sur FitPilot' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bienvenue sur FitPilot' })).toBeVisible();
  await context.setOffline(false);
});
