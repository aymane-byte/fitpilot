import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, updateSettings } from '@/db/db';
import { exportData } from '@/db/backup';
import { buildGpx } from '@/lib/gpx';
import { parsePace } from '@/lib/running';
import { runInsights } from '@/lib/runInsights';
import { ANALYSIS_VERSION, cleanImportedTrack, enrichRun, ensureRunAnalysis, readTrackFile, saveImportedRun, saveRun } from './service';
import { resolveWorkout, targetKey } from './workouts';

function line(n: number, speed = 3, dt = 2, t0 = Date.parse('2026-10-20T07:00:00Z'), alt?: (i: number) => number) {
  const dLat = (speed * dt) / 111_195;
  return Array.from({ length: n }, (_, i) => ({ t: t0 + i * dt * 1000, lat: 33.5 + i * dLat, lng: -7.6, accuracy: 5, seg: 0, ...(alt ? { alt: alt(i) } : {}) }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());

describe('enregistrement et analyse', () => {
  it('course GPS : meilleurs efforts, dénivelé GPS, version d’analyse, chaussure par défaut', async () => {
    const shoeId = (await db.shoes.add({ name: 'Pegasus', startKm: 0, alertKm: 700, retired: false, createdAt: 1 })) as number;
    await updateSettings({ defaultShoeId: shoeId });
    const pts = line(800, 3, 2, undefined, (i) => 20 + i * 0.05);
    const id = await saveRun({ date: '2026-10-20', type: 'easy', distanceKm: 4.8, durationSec: 1598, source: 'gps' }, pts, { defaultShoe: true });
    const run = (await db.runs.get(id))!;
    expect(run.bestEfforts?.['1k']).toBeGreaterThan(330);
    expect(run.bestEfforts?.['1mi']).toBeGreaterThan(530);
    expect(run.elevSource).toBe('gps');
    expect(run.elevGainM).toBeGreaterThan(30);
    expect(run.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(run.shoeId).toBe(shoeId);
    expect((await db.runPoints.where('runId').equals(id).first())?.alt).toBe(20);
  });
  it('course saisie à la main : pas de chaussure imposée', async () => {
    const shoeId = (await db.shoes.add({ name: 'X', startKm: 0, alertKm: 700, retired: false, createdAt: 1 })) as number;
    await updateSettings({ defaultShoeId: shoeId });
    const id = await saveRun({ date: '2026-10-20', type: 'easy', distanceKm: 5, durationSec: 1800, source: 'manual' });
    expect((await db.runs.get(id))?.shoeId).toBeUndefined();
  });
  it('recalcul des anciennes courses (records 400 m / mile ajoutés)', async () => {
    const id = (await db.runs.add({ date: '2026-10-01', type: 'easy', distanceKm: 3, durationSec: 1000, source: 'gps', createdAt: 1, bestEfforts: { '1k': 333 } })) as number;
    await db.runPoints.bulkAdd(line(600).map((p) => ({ ...p, runId: id })));
    expect(await ensureRunAnalysis()).toBe(1);
    const run = (await db.runs.get(id))!;
    expect(run.bestEfforts?.['400m']).toBeGreaterThan(130);
    expect(run.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(await ensureRunAnalysis()).toBe(0); // idempotent
  });
});

describe('enrichissement Open-Meteo (réseau simulé)', () => {
  it('altitude du terrain et météo enregistrées ; erreurs réseau silencieuses', async () => {
    const id = await saveRun({ date: '2026-10-20', type: 'easy', distanceKm: 1.2, durationSec: 400, source: 'gps' }, line(200));
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('/elevation')) {
        const n = new URL(url).searchParams.get('latitude')!.split(',').length;
        return new Response(JSON.stringify({ elevation: Array.from({ length: n }, (_, i) => 10 + i) }));
      }
      const base = Date.parse('2026-10-20T00:00:00Z') / 1000;
      return new Response(JSON.stringify({ hourly: { time: [base + 7 * 3600], temperature_2m: [18.4], weather_code: [1], wind_speed_10m: [9] } }));
    });
    expect(await enrichRun(id)).toEqual({ elevation: true, weather: true });
    const run = (await db.runs.get(id))!;
    expect(run.elevSource).toBe('dem');
    expect(run.elevGainM).toBeGreaterThan(0);
    expect(run.weather).toMatchObject({ tempC: 18, code: 1, windKmh: 9 });
    expect(calls.some((c) => c.startsWith('https://api.open-meteo.com/v1/forecast') || c.startsWith('https://archive-api.open-meteo.com'))).toBe(true);
    // Une fois enrichie, plus d'appel.
    calls.length = 0;
    expect(await enrichRun(id)).toEqual({ elevation: false, weather: false });
    expect(calls).toHaveLength(0);
  });
  it('hors-ligne : aucune erreur, rien n’est enregistré', async () => {
    const id = await saveRun({ date: '2026-10-20', type: 'easy', distanceKm: 1.2, durationSec: 400, source: 'gps' }, line(200));
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await enrichRun(id)).toEqual({ elevation: false, weather: false });
    expect((await db.runs.get(id))?.weather).toBeUndefined();
  });
});

describe('import GPX', () => {
  it('lecture, nettoyage, doublon détecté, enregistrement', async () => {
    const pts = line(400, 3, 2, undefined, (i) => 30 + (i % 5));
    // Un saut GPS aberrant au milieu.
    pts[200] = { ...pts[200], lat: pts[200].lat + 0.01 };
    const file = new File([buildGpx('Sortie Strava', pts)], 'sortie.gpx', { type: 'application/gpx+xml' });
    const preview = await readTrackFile(file);
    expect(preview.format).toBe('gpx');
    expect(preview.name).toBe('Sortie Strava');
    expect(preview.points).toHaveLength(399);
    expect(preview.distanceKm).toBeCloseTo(2.39, 1);
    expect(preview.hasAltitude).toBe(true);
    expect(preview.duplicateOf).toBeUndefined();
    const id = await saveImportedRun(preview, 'easy');
    const run = (await db.runs.get(id))!;
    expect(run.importedFrom).toBe('gpx');
    expect(run.startedAt).toBe(pts[0].t);
    expect(run.bestEfforts?.['1k']).toBeDefined();
    expect((await readTrackFile(file)).duplicateOf).toBe(id);
  });
  it('pause de 5 min dans un GPX : exclue du temps', () => {
    const a = line(100);
    const b = line(100, 3, 2, a.at(-1)!.t + 300_000).map((p) => ({ ...p, lat: p.lat + (a.at(-1)!.lat - 33.5) }));
    const cleaned = cleanImportedTrack({ points: [...a, ...b] });
    expect(new Set(cleaned.map((p) => p.seg)).size).toBe(2);
  });
  it('extension inconnue refusée', async () => {
    await expect(readTrackFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('sauvegarde', () => {
  it('chaussures et séances perso incluses dans l’export', async () => {
    await db.shoes.add({ name: 'A', startKm: 10, alertKm: 700, retired: false, createdAt: 1 });
    await db.runWorkouts.add({ name: 'S', runType: 'intervals', blocks: [], createdAt: 1 });
    const backup = await exportData({ includePhotos: false });
    expect(backup.tables.shoes).toHaveLength(1);
    expect(backup.tables.runWorkouts).toHaveLength(1);
    expect(backup.schemaVersion).toBe(5);
  });
});

describe('séances et synthèse', () => {
  it('allure saisie', () => {
    expect(parsePace('5:30')).toBe(330);
    expect(parsePace('4.05')).toBe(245);
    expect(parsePace('5:75')).toBeUndefined();
    expect(parsePace('1:30')).toBeUndefined();
    expect(parsePace('abc')).toBeUndefined();
  });
  it('résolution des clés de séance', () => {
    expect(resolveWorkout(targetKey(5000, 330, 8), null, [])?.blocks[0].steps[0]).toMatchObject({ by: 'distance', value: 5000, pace: 330, tolerance: 8 });
    expect(resolveWorkout('int-8x400', null, [])?.name).toBe('Fractionné 8 × 400 m');
    expect(resolveWorkout('perso-3', null, [{ id: 3, name: 'Mine', runType: 'intervals', blocks: [], createdAt: 1 }])?.name).toBe('Mine');
    expect(resolveWorkout('perso-9', null, [])).toBeNull();
    expect(resolveWorkout(null, null, [])).toBeNull();
  });
  it('synthèse : VDOT récent, allures, charge', () => {
    const ins = runInsights(
      [
        { id: 1, date: '2026-10-01', distanceKm: 5, durationSec: 1500, type: 'tempo', bestEfforts: { '5k': 1500 } },
        { id: 2, date: '2026-10-10', distanceKm: 8, durationSec: 3000, type: 'easy', rpe: 4 },
        { id: 3, date: '2025-01-10', distanceKm: 10, durationSec: 2400, type: 'tempo' }, // trop ancienne pour le VDOT
      ],
      '2026-10-30',
    );
    expect(ins.vdot?.from.date).toBe('2026-10-01');
    expect(ins.paces?.threshold).toBeGreaterThan(0);
    expect(ins.today?.date).toBe('2026-10-30');
    expect(ins.basis).toEqual({ rpe: 1, pace: 2, type: 0 });
  });
});
