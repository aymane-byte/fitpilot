/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// base './' : l'app fonctionne à la racine (Cloudflare Pages) comme dans un sous-dossier (GitHub Pages).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'FitPilot AI',
        short_name: 'FitPilot',
        description: 'Coach fitness personnel : muscu, course, nutrition, progrès. Données 100 % locales.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // data/*.json : table CIQUAL, disponible hors-ligne dès la première visite.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}', 'data/*.json'],
        // Dépendances optionnelles de jsPDF (méthodes .html() et SVG, non utilisées) : hors du cache hors-ligne.
        globIgnores: ['**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        navigateFallback: 'index.html',
        // Tuiles OpenStreetMap (phase 2) : cache limité, respect de la politique d'usage OSM.
        // Cartes : seules les tuiles déjà affichées sont gardées (cache du navigateur, pas de
        // téléchargement de zones), avec un plafond bien sous les limites d'OpenFreeMap
        // (3 000 tuiles / 50 Mo par téléchargement hors-ligne).
        runtimeCaching: [
          {
            // Styles, polices, icônes et description des tuiles : rafraîchis en arrière-plan.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/((styles|fonts|sprites)\/.*|planet)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'ofm-style', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'ofm-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'dem-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'proxy/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
