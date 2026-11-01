// Fiabilité de l'enregistrement : chrono calculé à partir des horodatages, trous GPS
// (app suspendue, écran verrouillé) détectés et marqués comme estimés.
import { haversine, type GeoPoint } from './geo';

export interface ClockState {
  /** Temps actif cumulé (ms) des portions terminées. */
  activeMs: number;
  /** Heure (ms) de la dernière reprise, null en pause. */
  resumedAt: number | null;
}

/**
 * Temps actif à l'instant `now` : ne dépend que des horodatages (départ, pauses, reprises).
 * Un setInterval ne sert qu'à rafraîchir l'affichage : si iOS suspend l'app, le temps reste juste.
 */
export function elapsedMs(c: ClockState, now: number): number {
  return c.activeMs + (c.resumedAt !== null ? Math.max(0, now - c.resumedAt) : 0);
}

/** Pause : fige le temps actif à l'instant `at`. */
export function pauseClock(c: ClockState, at: number): ClockState {
  return { activeMs: elapsedMs(c, at), resumedAt: null };
}

export function resumeClock(c: ClockState, at: number): ClockState {
  return c.resumedAt !== null ? c : { activeMs: c.activeMs, resumedAt: at };
}

/** Sans point GPS pendant plus de 30 s (en course, hors pause) : trou probable. */
export const GAP_MIN_SEC = 30;

export interface Gap {
  /** Indice du premier point après le trou. */
  index: number;
  fromT: number;
  toT: number;
  sec: number;
  /** Distance en ligne droite entre les deux points (estimation, sous-estime toujours le vrai trajet). */
  distanceM: number;
}

/** Trous GPS : deux points consécutifs du même segment séparés de plus de `minSec`. */
export function detectGaps(points: (GeoPoint & { gapBefore?: boolean })[], minSec = GAP_MIN_SEC): Gap[] {
  const out: Gap[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.seg ?? 0) !== (b.seg ?? 0)) continue;
    const sec = (b.t - a.t) / 1000;
    if (sec > minSec || b.gapBefore) out.push({ index: i, fromT: a.t, toT: b.t, sec: Math.round(sec), distanceM: Math.round(haversine(a, b)) });
  }
  return out;
}

export function estimatedDistanceM(points: GeoPoint[], minSec = GAP_MIN_SEC): number {
  return detectGaps(points, minSec).reduce((s, g) => s + g.distanceM, 0);
}

/**
 * Retire la partie estimée d'un trou : les points suivants passent dans un nouveau segment,
 * donc la ligne droite n'est plus comptée (ni distance, ni temps en mouvement).
 */
export function removeGap<T extends GeoPoint & { gapBefore?: boolean }>(points: T[], index: number): T[] {
  return points.map((p, i) => (i < index ? p : { ...p, seg: (p.seg ?? 0) + 1, ...(i === index ? { gapBefore: false } : {}) }));
}

/** Durée lisible « 4 min » / « 1 h 05 » pour le message « GPS interrompu pendant … ». */
export function gapLabel(sec: number): string {
  const m = Math.round(sec / 60);
  if (sec < 60) return `${Math.round(sec)} s`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
