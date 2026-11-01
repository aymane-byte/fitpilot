import { useMemo } from 'react';
import { projectRoute } from '@/lib/runAnalysis';

const cache = new Map<string, string>();

/**
 * Mini-carte de l'historique : image statique du tracé dessinée une fois en canvas, puis
 * réutilisée (pas de vraie carte par ligne : la liste reste fluide, même hors-ligne).
 */
export function MiniMap({ preview, size = 56, label }: { preview?: [number, number][]; size?: number; label?: string }) {
  const src = useMemo(() => (preview && preview.length > 1 ? render(preview, size) : null), [preview, size]);
  if (!src) return null;
  return <img src={src} width={size} height={size} alt={label ?? ''} role="img" aria-label={label} className="shrink-0 rounded-xl bg-surface-2" />;
}

function render(preview: [number, number][], size: number): string | null {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim() || '#c6ff3d';
  const key = `${size}|${color}|${preview.length}|${preview[0]}|${preview.at(-1)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(size * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  const px = projectRoute(preview.map(([lat, lng]) => ({ lat, lng })), size, size, 6);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  px.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(px[0][0], px[0][1], 2.6, 0, Math.PI * 2);
  ctx.fill();
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
