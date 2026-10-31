// Analyse d'une course à partir de ses points : splits, meilleurs efforts, dénivelé,
// tracé coloré par allure, simplification pour la carte, projection pour l'image de partage.
import { cleanAltitudes, elevationEvents, ELEV_THRESHOLD } from './elevation';
import { fastestSegment, haversine, type GeoPoint } from './geo';
import { RECORD_KEYS, RECORD_KM, type RecordDistance } from './running';

export interface TrackPoint extends GeoPoint {
  /** Altitude (m) : GPS du téléphone, fichier importé ou modèle de terrain Open-Meteo. */
  alt?: number;
}

const sameSeg = (a: GeoPoint, b: GeoPoint) => (a.seg ?? 0) === (b.seg ?? 0);

/** Distance (m) et temps en mouvement (s) cumulés à chaque point ; rien n'est compté entre deux segments. */
export function cumulative(points: GeoPoint[]): { dist: number[]; time: number[] } {
  const dist = [0];
  const time = [0];
  for (let i = 1; i < points.length; i++) {
    const same = sameSeg(points[i - 1], points[i]);
    dist.push(dist[i - 1] + (same ? haversine(points[i - 1], points[i]) : 0));
    time.push(time[i - 1] + (same ? (points[i].t - points[i - 1].t) / 1000 : 0));
  }
  return { dist, time };
}

export interface Split {
  /** Numéro du km (1, 2…) ; le dernier peut être partiel. */
  index: number;
  distanceM: number;
  sec: number;
  paceSec: number;
  gainM: number;
  lossM: number;
  partial: boolean;
}

/**
 * Splits par km : temps (interpolé au mètre près), allure, D+ et D− de chaque km.
 * Le dernier km partiel est inclus s'il fait au moins 50 m.
 */
export function detailedSplits(points: TrackPoint[], elevSource: 'gps' | 'dem' = 'gps'): Split[] {
  if (points.length < 2) return [];
  const { dist, time } = cumulative(points);
  const alts = cleanAltitudes(points.map((p) => p.alt), elevSource);
  const ev = alts ? elevationEvents(alts, ELEV_THRESHOLD[elevSource]) : null;
  const total = dist.at(-1)!;
  // Temps interpolé au passage d'une distance donnée.
  const timeAt = (d: number) => {
    let i = 1;
    while (i < dist.length - 1 && dist[i] < d) i++;
    const span = dist[i] - dist[i - 1];
    return span > 0 ? time[i - 1] + ((d - dist[i - 1]) / span) * (time[i] - time[i - 1]) : time[i];
  };
  const splits: Split[] = [];
  const marks: number[] = [];
  // Un reste de 990 m ou plus est un km complet (arrondis GPS : 4 998 m = 5 km).
  for (let k = 1000; k <= total + 10; k += 1000) marks.push(Math.min(k, total));
  if (total - (marks.at(-1) ?? 0) >= 50) marks.push(total);
  let prevD = 0;
  let prevT = 0;
  for (const m of marks) {
    const tAt = m === total ? time.at(-1)! : timeAt(m);
    let gain = 0;
    let loss = 0;
    if (ev) {
      for (let i = 0; i < points.length; i++) {
        if (dist[i] > prevD && dist[i] <= m) {
          gain += ev.gainAt[i];
          loss += ev.lossAt[i];
        }
      }
    }
    const d = m - prevD;
    const sec = tAt - prevT;
    splits.push({ index: splits.length + 1, distanceM: Math.round(d), sec: Math.round(sec), paceSec: d > 0 ? Math.round(sec / (d / 1000)) : 0, gainM: Math.round(gain), lossM: Math.round(loss), partial: d < 990 });
    prevD = m;
    prevT = tAt;
  }
  return splits;
}

/** Meilleurs efforts détectés dans une course (400 m, 1 km, 1 mile, 5 km, 10 km, semi). */
export function detectBestEfforts(points: GeoPoint[]): Partial<Record<RecordDistance, number>> {
  const out: Partial<Record<RecordDistance, number>> = {};
  for (const key of RECORD_KEYS) {
    const sec = fastestSegment(points, RECORD_KM[key] * 1000);
    if (sec) out[key] = sec;
  }
  return out;
}

/** Dénivelé total d'une trace (null si pas d'altitude). */
export function trackElevation(points: TrackPoint[], source: 'gps' | 'dem' = 'gps'): { gain: number; loss: number } | null {
  const alts = cleanAltitudes(points.map((p) => p.alt), source);
  if (!alts) return null;
  const { gain, loss } = elevationEvents(alts, ELEV_THRESHOLD[source]);
  return { gain, loss };
}

/** Profil d'altitude : distance (km) et altitude lissée, sous-échantillonné pour le graphique. */
export function elevationProfile(points: TrackPoint[], source: 'gps' | 'dem' = 'gps', maxPoints = 80): { km: number; alt: number }[] {
  const alts = cleanAltitudes(points.map((p) => p.alt), source);
  if (!alts) return [];
  const { dist } = cumulative(points);
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  const out: { km: number; alt: number }[] = [];
  for (let i = 0; i < points.length; i += step) out.push({ km: dist[i] / 1000, alt: Math.round(alts[i]) });
  if ((points.length - 1) % step) out.push({ km: dist.at(-1)! / 1000, alt: Math.round(alts.at(-1)!) });
  return out;
}

export interface EffortRank {
  key: RecordDistance;
  sec: number;
  /** 1 = record personnel (toutes courses confondues, à la date de cette course). */
  rank: number;
}

/**
 * Classement des efforts d'une course parmi les efforts GPS précédents (même date incluse
 * pour les courses enregistrées avant). Rang 1 = nouveau record ; on garde le top 3.
 */
export function rankEfforts(
  run: { id?: number; date: string; createdAt?: number; bestEfforts?: Partial<Record<RecordDistance, number>> },
  others: { id?: number; date: string; createdAt?: number; bestEfforts?: Partial<Record<RecordDistance, number>> }[],
): EffortRank[] {
  const out: EffortRank[] = [];
  const before = others.filter((o) => o.id !== run.id && (o.date < run.date || (o.date === run.date && (o.createdAt ?? 0) < (run.createdAt ?? 0))));
  for (const key of RECORD_KEYS) {
    const sec = run.bestEfforts?.[key];
    if (!sec) continue;
    const better = before.filter((o) => (o.bestEfforts?.[key] ?? Infinity) < sec).length;
    out.push({ key, sec, rank: better + 1 });
  }
  return out;
}

export interface PaceLine {
  points: [number, number][];
  /** 0 = le plus rapide de la course … buckets-1 = le plus lent. */
  bucket: number;
}

export interface PaceMap {
  lines: PaceLine[];
  /** Allures (s/km) des extrémités de l'échelle de couleurs (5e et 95e centiles). */
  fast: number;
  slow: number;
}

/**
 * Tracé découpé en morceaux colorés selon l'allure, sur une échelle linéaire entre l'allure
 * rapide (5e centile) et lente (95e centile) de la course. L'allure de chaque tronçon est
 * lissée sur ~100 m pour éviter les couleurs « clignotantes ».
 */
export function paceLines(points: GeoPoint[], buckets = 5, windowM = 100): PaceMap {
  const empty = { lines: [], fast: 0, slow: 0 };
  if (points.length < 2) return empty;
  const { dist, time } = cumulative(points);
  const legPace: (number | null)[] = [null];
  let lo = 0;
  for (let i = 1; i < points.length; i++) {
    if (!sameSeg(points[i - 1], points[i])) {
      legPace.push(null);
      lo = i;
      continue;
    }
    while (lo < i - 1 && dist[i] - dist[lo + 1] >= windowM) lo++;
    const d = dist[i] - dist[lo];
    const tt = time[i] - time[lo];
    legPace.push(d > 5 ? tt / (d / 1000) : null);
  }
  const valid = legPace.filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (!valid.length) return empty;
  const fast = valid[Math.floor((valid.length - 1) * 0.05)];
  const slow = valid[Math.ceil((valid.length - 1) * 0.95)];
  const span = slow - fast;
  // Écart de moins de 5 s/km : allure régulière, une seule couleur (celle du milieu).
  const bucketOf = (p: number) => (span < 5 ? Math.floor(buckets / 2) : Math.min(buckets - 1, Math.max(0, Math.floor(((p - fast) / span) * buckets))));
  const lines: PaceLine[] = [];
  for (let i = 1; i < points.length; i++) {
    const p = legPace[i];
    if (p === null) continue;
    const b = bucketOf(p);
    const last = lines.at(-1);
    const a: [number, number] = [points[i - 1].lat, points[i - 1].lng];
    const z: [number, number] = [points[i].lat, points[i].lng];
    if (last && last.bucket === b && last.points.at(-1)![0] === a[0] && last.points.at(-1)![1] === a[1]) last.points.push(z);
    else lines.push({ bucket: b, points: [a, z] });
  }
  return { lines, fast: Math.round(fast), slow: Math.round(slow) };
}

function perpDistance(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  // Projection locale équirectangulaire (suffisante à l'échelle d'une course).
  const k = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const qx = ax + u * dx, qy = ay + u * dy;
  return Math.hypot(px - qx, py - qy) * 111_195;
}

/** Simplification de Ramer-Douglas-Peucker (tolérance en m) : allège la carte de toutes les courses. */
export function simplify<T extends GeoPoint>(points: T[], toleranceM = 8): T[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Projette le tracé dans un rectangle (px) en gardant les proportions, centré. */
export function projectRoute(points: { lat: number; lng: number }[], width: number, height: number, pad = 0): [number, number][] {
  if (!points.length) return [];
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = width - 2 * pad;
  const h = height - 2 * pad;
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min(w / spanX, h / spanY);
  const offX = pad + (w - spanX * scale) / 2;
  const offY = pad + (h - spanY * scale) / 2;
  // Le nord en haut : y inversé.
  return points.map((_, i) => [offX + (xs[i] - minX) * scale, offY + (maxY - ys[i]) * scale]);
}

/**
 * Pauses automatiques pour une trace importée (GPX de Strava/montre souvent en un seul segment) :
 * un écart de plus de `gapSec` secondes avec moins de 0,5 m/s de déplacement ouvre un nouveau segment.
 */
export function autoPause<T extends GeoPoint>(points: T[], gapSec = 20): T[] {
  let seg = 0;
  return points.map((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      const dt = (p.t - prev.t) / 1000;
      if ((p.seg ?? 0) !== (prev.seg ?? 0) || (dt > gapSec && haversine(prev, p) / dt < 0.5)) seg++;
    }
    return { ...p, seg };
  });
}
