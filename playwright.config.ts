import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // Une relance max : Playwright les signale comme « flaky » (rien n'est masqué).
  retries: 1,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 180_000 },
  projects: [
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } },
    },
    // Contrôle de non-régression sur un second moteur (les captures ne viennent que de WebKit).
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7'] },
      grepInvert: /captures/,
    },
  ],
});
