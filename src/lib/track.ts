// Suivi GPS avancé : pause automatique, parcours favoris (comparaison des temps), recadrage,
// mini-tracé pour l'historique. Fonctions pures, testées sans GPS.
import { haversine, totalDistance, type GeoPoint } from './geo';
import { cumulative, simplify } from './runAnalysis';

export interface RawFix {
  t: number;
  lat: number;
  lng: number;
  accuracy: number;
}

export const AUTO_PAUSE = {
  /** Fenêtre d'observation (s) : immobile si on a bougé de moins de `stillM` sur cette durée. */
  windowSec: 10,
  stillM: 8,
  /** Reprise quand on s'éloigne de plus de `resumeM` du point d'arrêt. */
  resumeM: 12,
  /** Les positions moins précises ne décident de rien (le bruit ferait croire à un mouvement). */
  maxAccuracy: 25,
};

export type AutoPauseAction = { action: 'pause'; at: number } | { action: 'resume'; at: number } | null;

/**
 * Décision de pause / reprise automatique à partir des dernières positions brutes.
 * Pause : sur les `windowSec` dernières secondes, déplacement < `stillM` (≈ < 0,8 m/s) ;
 * l'arrêt est daté au début de la fenêtre (le temps passé immobile n'est pas compté).
 * Reprise : éloignement de plus de `resumeM` du point où l'on s'est arrêté.
 */
export function autoPauseDecide(recent: RawFix[], paused: boolean, anchor: { lat: number; lng: number } | null, cfg = AUTO_PAUSE): AutoPauseAction {
  const good = recent.filter((f) => f.accuracy <= cfg.maxAccuracy);
  const last = good.at(-1);
  if (!last) return null;
  if (paused) {
    if (anchor && haversine(anchor, last) > cfg.resumeM) return { action: 'resume', at: last.t };
    return null;
  }
  const from = good.find((f) => f.t >= last.t - cfg.windowSec * 1000);
  // Fenêtre pas encore assez longue (début de course, signal intermittent).
  if (!from || last.t - from.t < cfg.windowSec * 1000 * 0.8) return null;
  const moved = Math.max(...good.filter((f) => f.t >= from.t).map((f) => haversine(from, f)));
  return moved < cfg.stillM ? { action: 'pause', at: from.t } : null;
}

/** Tracé allégé (≤ `max` points) pour la liste des activités et les parcours favoris. */
export function trackPreview(points: GeoPoint[], max = 80): [number, number][] {
  if (points.length < 2) return [];
  let pts = simplify(points, 5);
  // Encore trop de points (tracé très sinueux) : échantillonnage régulier, extrémités gardées.
  if (pts.length > max) {
    const step = (pts.length - 1) / (max - 1);
    pts = Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
  }
  return pts.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5]);
}

const toPt = ([lat, lng]: [number, number]) => ({ lat, lng });

/** Distance (m) d'un point à une polyligne (plus petite distance aux segments, projection locale). */
export function distanceToLine(p: { lat: number; lng: number }, line: [number, number][]): number {
  let best = Infinity;
  const k = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[Math.min(i + 1, line.length - 1)];
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p.lng * k, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + u * dx), py - (ay + u * dy)) * 111_195;
    if (d < best) best = d;
  }
  return best;
}

export const ROUTE_MATCH = { toleranceM: 60, minShare: 0.85, maxDistanceGap: 0.12 };

/** Points intermédiaires tous les `stepM` mètres (au plus 400 points). */
export function densify(line: [number, number][], stepM = 25): [number, number][] {
  const out: [number, number][] = [line[0]];
  const total = previewLength(line);
  const step = Math.max(stepM, total / 400);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const n = Math.max(1, Math.ceil(haversine(toPt(a), toPt(b)) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Longueur (m) d'un tracé allégé. */
export function previewLength(line: [number, number][]): number {
  return totalDistance(line.map((p, i) => ({ ...toPt(p), t: i, accuracy: 0 })));
}

/**
 * Une course suit-elle un parcours favori ? Distance à ±12 %, et au moins 85 % des points de
 * chacun à moins de 60 m de l'autre tracé (dans les deux sens : ni raccourci, ni détour).
 */
export function matchesRoute(route: [number, number][], run: [number, number][], runDistanceM: number, cfg = ROUTE_MATCH): boolean {
  if (route.length < 2 || run.length < 2) return false;
  const routeM = previewLength(route);
  if (routeM <= 0 || Math.abs(runDistanceM - routeM) / routeM > cfg.maxDistanceGap) return false;
  // Les tracés allégés ont peu de sommets (une ligne droite = 2 points) : on compare des points
  // pris tous les ~25 m le long de chaque tracé.
  const share = (a: [number, number][], b: [number, number][]) => {
    const pts = densify(a);
    return pts.filter((p) => distanceToLine(toPt(p), b) <= cfg.toleranceM).length / pts.length;
  };
  return share(run, route) >= cfg.minShare && share(route, run) >= cfg.minShare;
}

export interface CropResult<T> {
  points: T[];
  distanceM: number;
  /** Temps en mouvement (s) des points gardés. */
  durationSec: number;
}

/** Recadrage : garde les points entre `startM` et `endM` (distance cumulée depuis le départ). */
export function cropTrack<T extends GeoPoint>(points: T[], startM: number, endM: number): CropResult<T> {
  const { dist } = cumulative(points);
  const kept = points.filter((_, i) => dist[i] >= startM - 1e-6 && dist[i] <= endM + 1e-6);
  const c = cumulative(kept);
  return { points: kept, distanceM: Math.round(c.dist.at(-1) ?? 0), durationSec: Math.round(c.time.at(-1) ?? 0) };
}
