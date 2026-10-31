import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';

const PAGES = ['#/', '#/muscu', '#/muscu?tab=programs', '#/muscu?tab=library', '#/course', '#/course/forme', '#/course/carte', '#/course/chaussures', '#/course/seances', '#/course/activites', '#/course/parcours', '#/nutrition', '#/nutrition?tab=foods', '#/nutrition?tab=plan', '#/nutrition?tab=recipes', '#/coach', '#/plus', '#/planning', '#/progres', '#/rapports', '#/profil', '#/parametres', '#/installer'];

for (const theme of ['dark', 'light'] as const) {
  test(`accessibilité (axe, WCAG 2.1 AA) — thème ${theme}`, async ({ page }) => {
    test.setTimeout(240_000);
    // Animations désactivées (préférence « réduire les animations », gérée par l'app) : axe ne doit
    // pas mesurer les contrastes pendant le fondu d'apparition des cartes.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await completeOnboarding(page);
    if (theme === 'light') {
      await page.goto('./#/parametres');
      await page.getByRole('radio', { name: 'Clair' }).click();
      // Thème réellement appliqué (et enregistré) avant de mesurer les contrastes.
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.waitForTimeout(500);
    }
    const problems: string[] = [];
    for (const path of PAGES) {
      await page.goto(`./${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of res.violations) problems.push(`${path} · ${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
