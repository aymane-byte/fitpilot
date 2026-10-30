// Open-Meteo (gratuit, sans clé, usage non commercial) : météo au moment de la course
// et altitude du terrain quand le GPS n'en fournit pas.
//  - Météo récente : api.open-meteo.com/v1/forecast (accepte des dates passées récentes).
//  - Météo ancienne : archive-api.open-meteo.com/v1/archive (réanalyse ERA5, ~5 jours de retard).
//  - Altitude : api.open-meteo.com/v1/elevation (modèle Copernicus 90 m, 100 points par requête).
import { cumulative } from './runAnalysis';
import type { GeoPoint } from './geo';

export interface RunWeather {
  tempC: number;
  feelsC?: number;
  humidity?: number;
  windKmh?: number;
  precipMm?: number;
  code: number;
  /** Heure (ms) de la mesure retenue. */
  at: number;
}

const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code';
/** Au-delà, l'API « forecast » ne couvre plus le passé : on passe aux archives. */
export const FORECAST_PAST_DAYS = 60;

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function weatherUrl(lat: number, lng: number, atMs: number, now = Date.now()): string {
  const day = utcDate(atMs);
  const recent = now - atMs < FORECAST_PAST_DAYS * 86_400_000;
  const base = recent ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
  return `${base}?latitude=${round(lat)}&longitude=${round(lng)}&hourly=${HOURLY}&start_date=${day}&end_date=${day}&timezone=GMT&timeformat=unixtime&wind_speed_unit=kmh`;
}

interface HourlyJson {
  hourly?: {
    time?: number[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

/** Valeur horaire la plus proche de `atMs`. null si la réponse ne contient pas de donnée exploitable. */
export function pickWeather(json: HourlyJson, atMs: number): RunWeather | null {
  const h = json.hourly;
  if (!h?.time?.length || !h.temperature_2m) return null;
  let best = -1;
  let bestGap = Infinity;
  h.time.forEach((t, i) => {
    const gap = Math.abs(t * 1000 - atMs);
    if (gap < bestGap && typeof h.temperature_2m![i] === 'number') {
      best = i;
      bestGap = gap;
    }
  });
  if (best < 0 || bestGap > 2 * 3600_000) return null;
  const v = (arr?: (number | null)[]) => (typeof arr?.[best] === 'number' ? (arr[best] as number) : undefined);
  return {
    tempC: Math.round(v(h.temperature_2m)!),
    feelsC: v(h.apparent_temperature) !== undefined ? Math.round(v(h.apparent_temperature)!) : undefined,
    humidity: v(h.relative_humidity_2m),
    windKmh: v(h.wind_speed_10m) !== undefined ? Math.round(v(h.wind_speed_10m)!) : undefined,
    precipMm: v(h.precipitation),
    code: v(h.weather_code) ?? 0,
    at: h.time[best] * 1000,
  };
}

/** Codes météo WMO → libellé français. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Ciel dégagé';
  if (code <= 2) return 'Peu nuageux';
  if (code === 3) return 'Couvert';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 57) return 'Bruine';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Pluie';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Neige';
  if (code >= 95) return 'Orage';
  return 'Variable';
}

/** Conseil simple lié à la chaleur (utilisé par le coach et le détail de course). */
export function heatAdvice(w: Pick<RunWeather, 'tempC' | 'feelsC'>): 'hot' | 'warm' | null {
  const t = w.feelsC ?? w.tempC;
  if (t >= 30) return 'hot';
  if (t >= 24) return 'warm';
  return null;
}

export const DEM_BATCH = 100;
export const DEM_MAX_BATCHES = 5;

/**
 * Indices des points à envoyer à l'API d'altitude : régulièrement espacés en distance
 * (au moins 30 m), au plus DEM_BATCH × DEM_MAX_BATCHES points, premier et dernier inclus.
 */
export function demSampleIndices(points: GeoPoint[]): number[] {
  if (!points.length) return [];
  const { dist } = cumulative(points);
  const total = dist.at(-1)!;
  const max = DEM_BATCH * DEM_MAX_BATCHES;
  const spacing = Math.max(30, total / (max - 1));
  const out = [0];
  let next = spacing;
  for (let i = 1; i < points.length - 1; i++) {
    if (dist[i] >= next) {
      out.push(i);
      next = dist[i] + spacing;
    }
  }
  if (points.length > 1) out.push(points.length - 1);
  return out.slice(0, max);
}

export function elevationUrls(points: { lat: number; lng: number }[]): string[] {
  const urls: string[] = [];
  for (let i = 0; i < points.length; i += DEM_BATCH) {
    const batch = points.slice(i, i + DEM_BATCH);
    urls.push(`https://api.open-meteo.com/v1/elevation?latitude=${batch.map((p) => round(p.lat, 5)).join(',')}&longitude=${batch.map((p) => round(p.lng, 5)).join(',')}`);
  }
  return urls;
}

/** Altitudes de tous les points, interpolées (en distance) entre les points échantillonnés. */
export function interpolateAltitudes(points: GeoPoint[], sampleIdx: number[], sampleAlt: number[]): number[] {
  const { dist } = cumulative(points);
  const out = new Array<number>(points.length);
  let k = 0;
  for (let i = 0; i < points.length; i++) {
    while (k < sampleIdx.length - 2 && dist[sampleIdx[k + 1]] < dist[i]) k++;
    const a = sampleIdx[k];
    const b = sampleIdx[Math.min(k + 1, sampleIdx.length - 1)];
    const span = dist[b] - dist[a];
    const f = span > 0 ? Math.min(1, Math.max(0, (dist[i] - dist[a]) / span)) : 0;
    out[i] = Math.round((sampleAlt[k] + f * ((sampleAlt[Math.min(k + 1, sampleAlt.length - 1)] ?? sampleAlt[k]) - sampleAlt[k])) * 10) / 10;
  }
  return out;
}
