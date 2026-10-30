// GPS : distance (haversine), filtrage des mauvais points, segments les plus rapides.

export interface GeoPoint {
  t: number; // ms
  lat: number;
  lng: number;
  accuracy: number; // m
  /** Numéro de segment : une pause démarre un nouveau segment (pas de distance entre deux segments). */
  seg?: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance en mètres entre deux points (formule de haversine). */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const GPS_FILTER = {
  /** Précision minimale acceptée (m). */
  maxAccuracy: 25,
  /** Vitesse maximale crédible pour un coureur (m/s) ≈ 30 km/h. */
  maxSpeed: 8.5,
  /** Déplacement minimal pour ajouter un point (réduit le bruit à l'arrêt). */
  minMove: 3,
};

export type FilterReason = 'accuracy' | 'speed' | 'jitter';

/**
 * Décide si un nouveau point doit être gardé, par rapport au dernier point gardé.
 * Renvoie la raison du rejet, ou null si le point est accepté.
 */
export function rejectReason(last: GeoPoint | undefined, p: GeoPoint, cfg = GPS_FILTER): FilterReason | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.accuracy > cfg.maxAccuracy) return 'accuracy';
  if (!last || (last.seg ?? 0) !== (p.seg ?? 0)) return null;
  const d = haversine(last, p);
  const dt = (p.t - last.t) / 1000;
  if (dt <= 0) return 'jitter';
  if (d / dt > cfg.maxSpeed) return 'speed';
  if (d < cfg.minMove) return 'jitter';
  return null;
}

export function filterPoints(points: GeoPoint[], cfg = GPS_FILTER): GeoPoint[] {
  const kept: GeoPoint[] = [];
  for (const p of points) if (rejectReason(kept.at(-1), p, cfg) === null) kept.push(p);
  return kept;
}

/** Distance totale (m), sans compter les sauts entre segments (pauses). */
export function totalDistance(points: GeoPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    if ((points[i].seg ?? 0) === (points[i - 1].seg ?? 0)) d += haversine(points[i - 1], points[i]);
  }
  return d;
}

/**
 * Temps le plus court (s) pour parcourir `meters` d'affilée dans un même segment
 * (fenêtre glissante, interpolation linéaire sur le dernier tronçon). null si trop court.
 */
export function fastestSegment(points: GeoPoint[], meters: number): number | null {
  let best: number | null = null;
  // Distances cumulées par segment
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const same = (points[i].seg ?? 0) === (points[i - 1].seg ?? 0);
    cum.push(cum[i - 1] + (same ? haversine(points[i - 1], points[i]) : 0));
  }
  let start = 0;
  for (let end = 1; end < points.length; end++) {
    if ((points[end].seg ?? 0) !== (points[end - 1].seg ?? 0)) {
      start = end;
      continue;
    }
    while (start < end && cum[end] - cum[start + 1] >= meters && (points[start + 1].seg ?? 0) === (points[end].seg ?? 0)) start++;
    const dist = cum[end] - cum[start];
    if (dist >= meters) {
      // Interpolation : on ne compte que le temps nécessaire pour atteindre exactement `meters`.
      const over = dist - meters;
      const lastLeg = cum[end] - cum[end - 1];
      const legTime = (points[end].t - points[end - 1].t) / 1000;
      const time = (points[end].t - points[start].t) / 1000 - (lastLeg > 0 ? (over / lastLeg) * legTime : 0);
      if (best === null || time < best) best = time;
    }
  }
  return best === null ? null : Math.round(best);
}

/** Temps cumulé en mouvement (s), hors pauses. */
export function movingTime(points: GeoPoint[]): number {
  let ms = 0;
  for (let i = 1; i < points.length; i++) {
    if ((points[i].seg ?? 0) === (points[i - 1].seg ?? 0)) ms += points[i].t - points[i - 1].t;
  }
  return Math.round(ms / 1000);
}

/** Temps de passage à chaque km complet (s par km). */
export function kmSplits(points: GeoPoint[]): number[] {
  const splits: number[] = [];
  let dist = 0;
  let time = 0;
  let lastMark = 0;
  for (let i = 1; i < points.length; i++) {
    if ((points[i].seg ?? 0) !== (points[i - 1].seg ?? 0)) continue;
    const d = haversine(points[i - 1], points[i]);
    const dt = (points[i].t - points[i - 1].t) / 1000;
    while (dist + d >= (splits.length + 1) * 1000) {
      const need = (splits.length + 1) * 1000 - dist;
      const tAt = time + (d > 0 ? (need / d) * dt : 0);
      splits.push(Math.round(tAt - lastMark));
      lastMark = tAt;
      if (splits.length > 1000) break;
    }
    dist += d;
    time += dt;
  }
  return splits;
}
