// Image de partage (1080 × 1350, format portrait des réseaux sociaux) dessinée en canvas :
// tracé de la course, distance, temps, allure, dénivelé. Aucune carte en fond (les tuiles
// OpenStreetMap ne doivent pas être recopiées en masse) : le tracé est dessiné seul, comme une signature.
import type { Run } from '@/db/types';
import { formatDateFr } from '@/lib/dates';
import { formatDuration, formatPace, paceSecPerKm } from '@/lib/running';
import { projectRoute, simplify, type TrackPoint } from '@/lib/runAnalysis';
import { num, t } from '@/i18n';

export const SHARE_W = 1080;
export const SHARE_H = 1350;

export function drawShareImage(canvas: HTMLCanvasElement, run: Run, points: TrackPoint[]) {
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const accent = '#c6ff3d';
  // Fond sombre avec léger dégradé.
  const bg = ctx.createLinearGradient(0, 0, 0, SHARE_H);
  bg.addColorStop(0, '#16171a');
  bg.addColorStop(1, '#0a0a0b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  const font = (weight: number, size: number) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.fillStyle = '#9b9ba5';
  ctx.font = font(500, 36);
  ctx.textBaseline = 'top';
  ctx.fillText(`${t.run.types[run.type]} · ${formatDateFr(run.date, { weekday: 'long', day: 'numeric', month: 'long' })}`, 80, 80);
  if (run.name) {
    ctx.fillStyle = '#f4f4f5';
    ctx.font = font(700, 44);
    ctx.fillText(run.name.slice(0, 32), 80, 132);
  }

  // Tracé
  const area = { x: 80, y: 220, w: SHARE_W - 160, h: 640 };
  const pts = simplify(points, 3);
  if (pts.length > 1) {
    const px = projectRoute(pts, area.w, area.h, 20);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 12;
    ctx.shadowColor = 'rgba(198,255,61,0.45)';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    px.forEach(([x, y], i) => {
      const seg = pts[i].seg ?? 0;
      if (i === 0 || seg !== (pts[i - 1].seg ?? 0)) ctx.moveTo(area.x + x, area.y + y);
      else ctx.lineTo(area.x + x, area.y + y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    const dot = (x: number, y: number, fill: string) => {
      ctx.beginPath();
      ctx.arc(area.x + x, area.y + y, 16, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0a0a0b';
      ctx.stroke();
    };
    dot(px[0][0], px[0][1], '#22c55e');
    dot(px.at(-1)![0], px.at(-1)![1], '#f4f4f5');
  }

  // Statistiques
  const pace = formatPace(paceSecPerKm(run.distanceKm, run.durationSec));
  const stats: [string, string][] = [
    [t.run.distance, `${num(run.distanceKm, 2)} km`],
    [t.run.durationLabel, formatDuration(run.durationSec)],
    [t.run.pace, `${pace} /km`],
  ];
  if (run.elevGainM !== undefined) stats.push([t.runx.elevation, `${run.elevGainM} m D+`]);
  const colW = (SHARE_W - 160) / 2;
  stats.forEach(([label, value], i) => {
    const x = 80 + (i % 2) * colW;
    const y = 920 + Math.floor(i / 2) * 170;
    ctx.fillStyle = '#9b9ba5';
    ctx.font = font(500, 34);
    ctx.fillText(label, x, y);
    ctx.fillStyle = '#f4f4f5';
    ctx.font = font(700, 76);
    ctx.fillText(value, x, y + 46);
  });

  ctx.fillStyle = accent;
  ctx.font = font(800, 34);
  ctx.textAlign = 'right';
  ctx.fillText('FitPilot', SHARE_W - 80, SHARE_H - 90);
  ctx.textAlign = 'left';
}

export async function shareImageBlob(run: Run, points: TrackPoint[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawShareImage(canvas, run, points);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}
