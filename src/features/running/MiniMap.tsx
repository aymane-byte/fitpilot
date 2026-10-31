import { projectRoute } from '@/lib/runAnalysis';

/** Mini-carte du tracé (SVG, sans fond de carte : légère, fonctionne hors-ligne). */
export function MiniMap({ preview, size = 56, label }: { preview?: [number, number][]; size?: number; label?: string }) {
  if (!preview || preview.length < 2) return null;
  const px = projectRoute(preview.map(([lat, lng]) => ({ lat, lng })), size, size, 5);
  const d = px.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="shrink-0 rounded-xl bg-surface-2">
      <path d={d} fill="none" stroke="var(--accent-text)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px[0][0]} cy={px[0][1]} r={2.5} fill="#22c55e" />
    </svg>
  );
}
