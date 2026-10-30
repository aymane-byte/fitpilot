// Génère les icônes PWA/iOS à partir de public/icons/logo.svg.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icons/logo.svg');
const out = 'public/icons/';
await sharp(svg).resize(192, 192).png().toFile(out + 'icon-192.png');
await sharp(svg).resize(512, 512).png().toFile(out + 'icon-512.png');
await sharp(svg).resize(180, 180).png().toFile(out + 'apple-touch-icon.png');
// Maskable : le logo est réduit à ~80 % (zone de sécurité) sur fond plein.
const inner = await sharp(svg).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0a0a0b' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(out + 'icon-maskable-512.png');
console.log('Icônes générées.');
