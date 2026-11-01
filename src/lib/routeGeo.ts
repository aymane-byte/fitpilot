// Géométrie des cartes de course (sans dépendance à MapLibre, testable) : tracé découpé en
// morceaux colorés selon l'allure, trous GPS en pointillés, marqueurs de km, point le plus
// proche d'un toucher (distance, allure, altitude à cet endroit).
import { haversine, type GeoPoint } from './geo';
import { cumulative, paceLines } from './runAnalysis';

export type RoutePoint = GeoPoint & { alt?: number; gapBefore?: boolean };

/** Vert (rapide) → jaune → rouge (lent), 9 nuances : rendu proche d'un dégradé continu. */
export const PACE_SCALE = ['#00a65a', '#3dba4e', '#7fcb3f', '#bcd632', '#f1d22c', '#f9ac2a', '#f6802b', '#ec552b', '#d7262b'];

/** Les trous GPS ne sont pas colorés comme une allure : ils ouvrent un « segment » pour le calcul. */
function splitAtGaps(points: RoutePoint[]): RoutePoint[] {
  let shift = 0;
  return points.map((p, i) => {
    if (i > 0 && p.gapBefore && (p.seg ?? 0) === (points[i - 1].seg ?? 0)) shift++;
    return shift ? { ...p, seg: (p.seg ?? 0) * 1000 + shift } : p;
  });
}

type Line = { type: 'Feature'; properties: Record<string, string | number>; geometry: { type: 'LineString'; coordinates: [number, number][] } };

export interface RouteGeo {
  /** Morceaux de tracé (couleur selon l'allure si `colored`). */
  lines: Line[];
  /** Lignes droites estimées pendant les trous GPS. */
  gaps: Line[];
  kmMarks: { km: number; lng: number; lat: number }[];
  start?: [number, number];
  end?: [number, number];
  bounds?: [[number, number], [number, number]];
  fast: number;
  slow: number;
}

export function routeGeo(points: RoutePoint[], colored = true): RouteGeo {
  const out: RouteGeo = { lines: [], gaps: [], kmMarks: [], fast: 0, slow: 0 };
  if (points.length < 2) return out;
  const split = splitAtGaps(points);
  if (colored) {
    const map = paceLines(split, PACE_SCALE.length);
    out.fast = map.fast;
    out.slow = map.slow;
    out.lines = map.lines.map((l) => ({ type: 'Feature', properties: { color: PACE_SCALE[l.bucket] }, geometry: { type: 'LineString', coordinates: l.points.map(([lat, lng]) => [lng, lat]) } }));
  }
  if (!out.lines.length) {
    const segs = new Map<number, [number, number][]>();
    for (const p of split) segs.set(p.seg ?? 0, [...(segs.get(p.seg ?? 0) ?? []), [p.lng, p.lat]]);
    out.lines = [...segs.values()].filter((c) => c.length > 1).map((c) => ({ type: 'Feature', properties: { color: '' }, geometry: { type: 'LineString', coordinates: c } }));
  }
  for (let i = 1; i < points.length; i++) {
    if (points[i].gapBefore && (points[i].seg ?? 0) === (points[i - 1].seg ?? 0)) {
      out.gaps.push({ type: 'Feature', properties: { index: i }, geometry: { type: 'LineString', coordinates: [[points[i - 1].lng, points[i - 1].lat], [points[i].lng, points[i].lat]] } });
    }
  }
  // Marqueurs de km (distance cumulée, interpolée entre deux points).
  const { dist } = cumulative(points);
  for (let k = 1, i = 1; k * 1000 <= dist.at(-1)!; k++) {
    while (i < dist.length - 1 && dist[i] < k * 1000) i++;
    const span = dist[i] - dist[i - 1];
    const f = span > 0 ? (k * 1000 - dist[i - 1]) / span : 0;
    out.kmMarks.push({ km: k, lat: points[i - 1].lat + f * (points[i].lat - points[i - 1].lat), lng: points[i - 1].lng + f * (points[i].lng - points[i - 1].lng) });
  }
  out.start = [points[0].lng, points[0].lat];
  out.end = [points.at(-1)!.lng, points.at(-1)!.lat];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  out.bounds = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
  return out;
}

export interface PointInfo {
  index: number;
  km: number;
  /** Allure lissée sur ~200 m autour du point (s/km), null si inconnue. */
  paceSec: number | null;
  alt?: number;
  lng: number;
  lat: number;
}

/** Point du tracé le plus proche d'un toucher, avec distance parcourue, allure et altitude. */
export function nearestInfo(points: RoutePoint[], at: { lng: number; lat: number }): PointInfo | null {
  if (!points.length) return null;
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = haversine(p, at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const { dist, time } = cumulative(points);
  let lo = best;
  let hi = best;
  while (lo > 0 && dist[best] - dist[lo] < 100 && (points[lo - 1].seg ?? 0) === (points[best].seg ?? 0) && !points[lo].gapBefore) lo--;
  while (hi < points.length - 1 && dist[hi] - dist[best] < 100 && (points[hi + 1].seg ?? 0) === (points[best].seg ?? 0) && !points[hi + 1].gapBefore) hi++;
  const dd = dist[hi] - dist[lo];
  const p = points[best];
  return { index: best, km: Math.round(dist[best]) / 1000, paceSec: dd > 20 ? Math.round((time[hi] - time[lo]) / (dd / 1000)) : null, alt: typeof p.alt === 'number' ? Math.round(p.alt) : undefined, lng: p.lng, lat: p.lat };
}
