import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from './helpers';

async function configureGroq(page: Page) {
  await page.goto('./#/parametres');
  await page.getByRole('radio', { name: 'Groq' }).click();
  await expect(page.getByText(/stockée uniquement sur ce téléphone/)).toBeVisible();
  await page.getByLabel('Clé API Groq').fill('gsk_test');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Réglages du coach enregistrés')).toBeVisible();
}

test('coach par règles : analyse, sécurité, historique conservé', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('link', { name: 'Coach', exact: true }).click();
  await expect(page.getByText('Analyse de la semaine')).toBeVisible();
  await page.getByRole('button', { name: 'Analyse ma semaine' }).click();
  await expect(page.getByText('Bilan de la semaine').first()).toBeVisible();
  await expect(page.getByTestId('msg-provider').last()).toHaveText('Analyse par règles locale (pas une IA)');

  await page.getByPlaceholder('Pose ta question…').fill('J’ai une douleur au genou, quel médicament ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText(/consulte un médecin/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/consulte un médecin/)).toBeVisible();
  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByRole('dialog').getByText('Analyse ma semaine')).toBeVisible();
});

test('Groq (réponse simulée) : libellé du modèle et tokens', async ({ page }) => {
  await completeOnboarding(page);
  await page.route('https://api.groq.com/**', async (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBe('Bearer gsk_test');
    expect(body.messages[0].content).toContain('objectifsJour'); // résumé compact envoyé
    await route.fulfill({ json: { choices: [{ message: { content: 'Réponse du modèle Groq.' } }], usage: { total_tokens: 1234 } } });
  });
  await configureGroq(page);
  await page.goto('./#/coach');
  await page.getByRole('button', { name: 'Que faire aujourd’hui ?' }).click();
  await expect(page.getByText('Réponse du modèle Groq.')).toBeVisible();
  await expect(page.getByTestId('msg-provider').last()).toContainText('Groq · openai/gpt-oss-20b');
  await expect(page.getByTestId('msg-provider').last()).toContainText('1 234 tokens');
});

test('Groq quota dépassé → repli automatique sur les règles', async ({ page }) => {
  await completeOnboarding(page);
  await page.route('https://api.groq.com/**', (route) => route.fulfill({ status: 429, json: { error: 'rate' } }));
  await configureGroq(page);
  await page.goto('./#/coach');
  await page.getByRole('button', { name: 'Mes protéines sont-elles suffisantes ?' }).click();
  await expect(page.getByText(/Réponse de secours par règles locales : quota gratuit atteint/)).toBeVisible();
  await expect(page.getByText(/Protéines : il me faut au moins 3 journées/)).toBeVisible();
});
