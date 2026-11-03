import { z } from 'zod';
import { db, getSettings } from '@/db/db';
import type { Run, RunPoint, RunType } from '@/db/types';
import { t } from '@/i18n';
import { isoDate } from '@/lib/schemas';
import { toISODate } from '@/lib/dates';
import { GPS_FILTER, haversine, movingTime, totalDistance } from '@/lib/geo';
import { altitudeCoverage } from '@/lib/elevation';
import { autoPause, detectBestEfforts, trackElevation, type TrackPoint } from '@/lib/runAnalysis';
import { cropTrack, matchesRoute, previewLength, trackPreview } from '@/lib/track';
import { detectGaps, estimatedDistanceM, removeGap } from '@/lib/liveRun';
import type { FavoriteRoute } from '@/db/types';
import { demSampleIndices, elevationUrls, interpolateAltitudes, pickWeather, weatherUrl } from '@/lib/openMeteo';
import { TrackImportError, type ImportedTrack } from '@/lib/gpx';
import { maxSpeedFor, minPaceFor, RUN_TYPES, typeFromActivity, type RunTypeKey } from '@/lib/runTypes';

/** Incrémenter quand l'analyse d'une course change : les anciennes courses sont recalculées. */
export const ANALYSIS_VERSION = 3;

export const runEntrySchema = z
  .object({
    date: isoDate,
    type: z.enum(RUN_TYPES),
    distanceKm: z.number({ error: t.run.errDistance }).min(0.1, t.run.errDistance).max(300, t.run.errDistance),
    durationSec: z.number({ error: t.run.errDuration }).int().positive(t.run.errDuration).max(48 * 3600, t.run.errDuration),
    notes: z.string().max(500).optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    shoeId: z.number().int().positive().optional(),
  })
  // Allure minimale crédible : 2:30 /km à pied (plus rapide que le record du 1 500 m), 90 km/h à vélo.
  .refine((r) => r.durationSec / r.distanceKm >= minPaceFor(r.type), { message: t.run.errPace, path: ['durationSec'] });

export type RunEntry = z.infer<typeof runEntrySchema>;

/** Résultats d'analyse calculés à partir des points (meilleurs efforts, dénivelé). */
type Analysis = Pick<Run, 'bestEfforts' | 'elevGainM' | 'elevLossM' | 'elevSource' | 'analysisVersion' | 'preview' | 'estimatedM'>;

export function analyzePoints(points: TrackPoint[]): Analysis {
  const out: Analysis = { analysisVersion: ANALYSIS_VERSION };
  if (!points.length) return out;
  out.bestEfforts = detectBestEfforts(points);
  out.preview = trackPreview(points);
  // Lignes droites estimées pendant les trous GPS (incluses dans la distance, affichées à part).
  out.estimatedM = estimatedDistanceM(points);
  // Altitude GPS exploitable seulement si la majorité des points en ont une.
  if (altitudeCoverage(points.map((p) => p.alt)) >= 0.5) {
    const elev = trackElevation(points, 'gps');
    if (elev) Object.assign(out, { elevGainM: elev.gain, elevLossM: elev.loss, elevSource: 'gps' as const });
  }
  return out;
}

const toRow = (runId: number, p: TrackPoint & { gapBefore?: boolean }): RunPoint => ({ runId, t: p.t, lat: p.lat, lng: p.lng, accuracy: p.accuracy, seg: p.seg, ...(typeof p.alt === 'number' ? { alt: p.alt } : {}), ...(p.gapBefore ? { gapBefore: true } : {}) });

/**
 * Enregistre une course (et ses points GPS) ; coche la course prévue ce jour-là.
 * `defaultShoe` : attribue la paire par défaut si aucune n'est choisie (course GPS, import).
 */
export async function saveRun(
  entry: RunEntry & { source: Run['source']; name?: string; startedAt?: number; importedFrom?: Run['importedFrom']; workoutName?: string },
  points: TrackPoint[] = [],
  opts: { defaultShoe?: boolean } = {},
): Promise<number> {
  let shoeId = entry.shoeId;
  if (shoeId === undefined && opts.defaultShoe) {
    const { defaultShoeId } = await getSettings();
    if (defaultShoeId && (await db.shoes.get(defaultShoeId))?.retired === false) shoeId = defaultShoeId;
  }
  const runId = (await db.transaction('rw', [db.runs, db.runPoints, db.scheduledActivities], async () => {
    const planned = await db.scheduledActivities.where('date').equals(entry.date).filter((a) => a.kind === 'run' && a.status === 'planned').first();
    const id = (await db.runs.add({
      ...entry,
      type: entry.type as RunType,
      shoeId,
      ...analyzePoints(points),
      scheduledId: planned?.id,
      createdAt: Date.now(),
    })) as number;
    if (points.length) await db.runPoints.bulkAdd(points.map((p) => toRow(id, p)));
    if (planned) await db.scheduledActivities.update(planned.id!, { status: 'done' });
    return id;
  })) as number;
  return runId;
}

export async function updateRun(runId: number, patch: Partial<Pick<Run, 'shoeId' | 'rpe' | 'notes' | 'type' | 'name'>>) {
  await db.runs.update(runId, patch);
}

/**
 * Recadre une course GPS : retire le début et/ou la fin (ex. GPS oublié allumé dans le bus).
 * Distance, durée, meilleurs efforts, dénivelé et tracé sont recalculés. Irréversible.
 */
export async function cropRun(runId: number, startM: number, endM: number): Promise<void> {
  const pts = await runPoints(runId);
  const res = cropTrack(pts, startM, endM);
  if (res.points.length < 2 || res.distanceM < 100) throw new Error('crop');
  const keep = new Set(res.points.map((p) => p.id));
  const run = await db.runs.get(runId);
  const analysis = analyzePoints(res.points);
  await db.transaction('rw', db.runs, db.runPoints, async () => {
    await db.runPoints.bulkDelete(pts.filter((p) => !keep.has(p.id)).map((p) => p.id!));
    await db.runs.update(runId, {
      ...analysis,
      // Altitude du terrain : recalculée sur la portion gardée.
      ...(run?.elevSource === 'dem' && !analysis.elevSource ? (() => { const e = trackElevation(res.points, 'dem'); return e ? { elevGainM: e.gain, elevLossM: e.loss, elevSource: 'dem' as const } : {}; })() : {}),
      distanceKm: Math.round(res.distanceM / 10) / 100,
      durationSec: Math.max(1, res.durationSec),
      startedAt: res.points[0].t,
      cropped: true,
    });
  });
}

/**
 * Retire après coup la ligne droite estimée d'un trou GPS : les points suivants passent dans un
 * nouveau segment ; distance, temps (durée du trou), records et dénivelé sont recalculés.
 */
export async function removeRunGap(runId: number, pointIndex: number): Promise<void> {
  const pts = await runPoints(runId);
  const gap = detectGaps(pts).find((g) => g.index === pointIndex);
  const run = await db.runs.get(runId);
  if (!gap || !run) return;
  const next = removeGap(pts, pointIndex);
  const analysis = analyzePoints(next);
  await db.transaction('rw', db.runs, db.runPoints, async () => {
    await db.runPoints.bulkPut(next);
    await db.runs.update(runId, {
      ...analysis,
      distanceKm: Math.max(0.01, Math.round((run.distanceKm - gap.distanceM / 1000) * 100) / 100),
      durationSec: Math.max(1, run.durationSec - gap.sec),
    });
  });
}

/** Enregistre le tracé d'une course comme parcours favori. */
export async function saveRouteFromRun(runId: number, name: string): Promise<number> {
  const run = await db.runs.get(runId);
  const preview = run?.preview?.length ? run.preview : trackPreview(await runPoints(runId));
  if (preview.length < 2) throw new Error('route');
  return (await db.routes.add({ name: name.trim().slice(0, 50), preview, distanceM: Math.round(previewLength(preview)), runId, createdAt: Date.now() })) as number;
}

/** Courses qui suivent un parcours favori, triées du plus rapide au plus lent. */
export function routeRuns(route: FavoriteRoute, runs: Run[]): Run[] {
  return runs.filter((r) => r.preview && matchesRoute(route.preview, r.preview, r.distanceKm * 1000)).sort((a, b) => a.durationSec - b.durationSec);
}

export async function deleteRun(runId: number) {
  await db.transaction('rw', db.runs, db.runPoints, async () => {
    await db.runPoints.where('runId').equals(runId).delete();
    await db.runs.delete(runId);
  });
}

export async function runPoints(runId: number): Promise<RunPoint[]> {
  return db.runPoints.where('runId').equals(runId).sortBy('t');
}

/**
 * Recalcule l'analyse des courses enregistrées avec une ancienne version (ex. courses GPS
 * de la première version : seulement 1/5/10 km). Ne touche pas aux données saisies.
 */
export async function ensureRunAnalysis(): Promise<number> {
  const stale = await db.runs.filter((r) => (r.analysisVersion ?? 0) < ANALYSIS_VERSION).toArray();
  let n = 0;
  for (const run of stale) {
    const pts = await runPoints(run.id!);
    const patch = analyzePoints(pts);
    // Ne pas écraser un dénivelé issu du modèle de terrain par une absence d'altitude GPS.
    if (run.elevSource === 'dem') {
      delete patch.elevGainM;
      delete patch.elevLossM;
      delete patch.elevSource;
    }
    await db.runs.update(run.id!, patch);
    n++;
  }
  return n;
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Altitude depuis le modèle de terrain Open-Meteo quand le GPS n'en a pas fourni. */
export async function fetchDemElevation(runId: number): Promise<boolean> {
  const pts = await runPoints(runId);
  if (pts.length < 2 || altitudeCoverage(pts.map((p) => p.alt)) >= 0.5) return false;
  const idx = demSampleIndices(pts);
  const alts: number[] = [];
  for (const url of elevationUrls(idx.map((i) => pts[i]))) {
    const json = await fetchJson<{ elevation?: number[] }>(url);
    if (!Array.isArray(json.elevation)) throw new Error('elevation');
    alts.push(...json.elevation);
  }
  if (alts.length !== idx.length) throw new Error('elevation');
  const full = interpolateAltitudes(pts, idx, alts);
  const withAlt = pts.map((p, i) => ({ ...p, alt: full[i] }));
  const elev = trackElevation(withAlt, 'dem');
  await db.transaction('rw', db.runs, db.runPoints, async () => {
    await db.runPoints.bulkPut(withAlt);
    await db.runs.update(runId, { elevGainM: elev?.gain, elevLossM: elev?.loss, elevSource: 'dem' });
  });
  return true;
}

export async function fetchRunWeather(runId: number): Promise<boolean> {
  const run = await db.runs.get(runId);
  if (!run || run.weather) return false;
  const pts = await runPoints(runId);
  if (!pts.length) return false;
  const first = pts[0];
  // Milieu de la course : plus représentatif qu'au départ pour une sortie longue.
  const at = first.t + (pts.at(-1)!.t - first.t) / 2;
  const w = pickWeather(await fetchJson(weatherUrl(first.lat, first.lng, at)), at);
  if (!w) return false;
  await db.runs.update(runId, { weather: w });
  return true;
}

/** Enrichissements en ligne (altitude, météo). Silencieux hors-ligne : relancé à la prochaine ouverture. */
export async function enrichRun(runId: number): Promise<{ elevation: boolean; weather: boolean }> {
  const out = { elevation: false, weather: false };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return out;
  try {
    out.elevation = await fetchDemElevation(runId);
  } catch {
    /* réseau indisponible ou quota : nouvel essai plus tard */
  }
  try {
    out.weather = await fetchRunWeather(runId);
  } catch {
    /* idem */
  }
  return out;
}

export interface ImportPreview {
  fileName: string;
  name?: string;
  date: string;
  startedAt: number;
  distanceKm: number;
  durationSec: number;
  points: TrackPoint[];
  format: 'gpx' | 'fit';
  hasAltitude: boolean;
  /** Course déjà présente (même heure de départ à 2 min près). */
  duplicateOf?: number;
  /** Type proposé d'après le fichier (vélo, marche, rando, course). */
  suggestedType: RunTypeKey;
}

/** Points aberrants d'une trace importée (sauts de position) retirés ; pauses détectées. */
export function cleanImportedTrack(track: ImportedTrack, maxSpeed = GPS_FILTER.maxSpeed): TrackPoint[] {
  const kept: TrackPoint[] = [];
  for (const p of track.points) {
    const last = kept.at(-1);
    if (last && (last.seg ?? 0) === (p.seg ?? 0)) {
      const dt = (p.t - last.t) / 1000;
      if (dt <= 0) continue;
      if (haversine(last, p) / dt > maxSpeed) continue;
    }
    kept.push(p);
  }
  return autoPause(kept);
}

/** Archive Strava : .gpx.gz / .fit.gz décompressés dans le navigateur (DecompressionStream, iOS 16.4+). */
async function gunzip(file: File): Promise<File> {
  if (typeof DecompressionStream === 'undefined') throw new TrackImportError('invalid');
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new File([buf], file.name.replace(/\.gz$/i, ''));
}

export async function readTrackFile(input: File): Promise<ImportPreview> {
  let file = input;
  if (/\.gz$/i.test(file.name)) {
    try {
      file = await gunzip(file);
    } catch {
      throw new TrackImportError('invalid');
    }
  }
  const lower = file.name.toLowerCase();
  let track: ImportedTrack;
  let format: 'gpx' | 'fit';
  if (lower.endsWith('.fit')) {
    const { parseFit } = await import('@/lib/fit');
    track = await parseFit(await file.arrayBuffer());
    format = 'fit';
  } else if (lower.endsWith('.gpx') || file.type.includes('xml')) {
    const { parseGpx } = await import('@/lib/gpx');
    track = parseGpx(await file.text());
    format = 'gpx';
  } else throw new TrackImportError('invalid');
  const suggestedType = typeFromActivity(track.activity) ?? 'easy';
  const points = cleanImportedTrack(track, maxSpeedFor(suggestedType));
  if (points.length < 2) throw new TrackImportError('empty');
  const distM = totalDistance(points);
  // Temps en mouvement : celui de la montre (FIT) si fourni, sinon calculé (pauses exclues).
  const durationSec = track.timerSec && track.timerSec > 0 ? track.timerSec : movingTime(points);
  const startedAt = points[0].t;
  const dup = await db.runs.filter((r) => r.startedAt !== undefined && Math.abs(r.startedAt - startedAt) < 120_000).first();
  return {
    fileName: file.name,
    name: track.name,
    date: toISODate(new Date(startedAt)),
    startedAt,
    distanceKm: Math.round(((track.distanceM ?? distM) / 1000) * 100) / 100,
    durationSec,
    points,
    format,
    hasAltitude: altitudeCoverage(points.map((p) => p.alt)) >= 0.5,
    duplicateOf: dup?.id,
    suggestedType,
  };
}

export async function saveImportedRun(preview: ImportPreview, type: RunType): Promise<number> {
  const entry = runEntrySchema.parse({ date: preview.date, type, distanceKm: Math.max(0.1, preview.distanceKm), durationSec: Math.max(1, Math.round(preview.durationSec)) });
  return saveRun({ ...entry, source: 'gps', name: preview.name, startedAt: preview.startedAt, importedFrom: preview.format }, preview.points, { defaultShoe: true });
}
