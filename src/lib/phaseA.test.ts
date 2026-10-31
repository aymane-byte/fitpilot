import { describe, expect, it } from 'vitest';
import { FitBaseType, FitEncoder } from 'fit-file-parser';
import { cleanAltitudes, elevationEvents, fillGaps, smoothAltitudes } from './elevation';
import { autoPause, detailedSplits, detectBestEfforts, elevationProfile, paceLines, projectRoute, rankEfforts, simplify, trackElevation, type TrackPoint } from './runAnalysis';
import { bestVdot, paceAtFraction, predictTime, trainingPaces, vdot } from './vdot';
import { formZone, intensityFactor, rampRate, runLoad, trainingLoadSeries } from './load';
import { goalProgress, periodRange, shoeKm, shoeStatus } from './runGoals';
import { announceMark, DEFAULT_VOICE, distanceAnnouncement, spokenDistance, spokenDuration, spokenPace } from './voice';
import { advance, builtinWorkouts, customWorkout, expandWorkout, initialEngine, paceFeedback, shouldAlertPace, stepAnnouncement, stepStatus, targetPaceWorkout, workoutTotals } from './guided';
import { demSampleIndices, elevationUrls, interpolateAltitudes, pickWeather, weatherLabel, weatherUrl } from './openMeteo';
import { buildGpx, parseGpx, TrackImportError } from './gpx';
import { parseFit, trackFromFitData } from './fit';
import { runRecords } from './running';

/** Bruit pseudo-aléatoire reproductible (LCG). */
function noise(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32 - 0.5;
  };
}

/** Ligne droite vers le nord à `speed` m/s, un point toutes les `dt` s. */
function line(n: number, speed = 3, dt = 2, opts: { seg?: number; t0?: number; alt?: (i: number) => number | undefined } = {}): TrackPoint[] {
  const dLat = (speed * dt) / 111_195;
  return Array.from({ length: n }, (_, i) => ({ t: (opts.t0 ?? 0) + i * dt * 1000, lat: 33.5 + i * dLat, lng: -7.6, accuracy: 5, seg: opts.seg ?? 0, ...(opts.alt ? { alt: opts.alt(i) } : {}) }));
}

describe('altitude et dénivelé', () => {
  it('comble les trous par interpolation', () => {
    expect(fillGaps([undefined, 10, undefined, 20, null])).toEqual([10, 10, 15, 20, 20]);
    expect(fillGaps([undefined, null])).toBeNull();
  });
  it('le filtre médian supprime un pic isolé', () => {
    const s = smoothAltitudes([10, 10, 10, 60, 10, 10, 10], 5);
    expect(Math.max(...s)).toBeLessThan(11);
  });
  it('parcours plat bruité (±6 m) : quasi pas de dénivelé', () => {
    const r = noise(7);
    const alts = Array.from({ length: 400 }, () => 50 + r() * 12);
    const naive = alts.slice(1).reduce((s, a, i) => s + Math.max(0, a - alts[i]), 0);
    const { gain } = elevationEvents(cleanAltitudes(alts)!);
    expect(naive).toBeGreaterThan(500); // ce que donnerait une somme naïve
    expect(gain).toBeLessThan(15);
  });
  it('montée de 60 m bruitée puis descente : D+ et D− proches du réel', () => {
    const r = noise(3);
    const alts = Array.from({ length: 300 }, (_, i) => (i < 150 ? i * 0.4 : (300 - i) * 0.4) + r() * 6);
    const { gain, loss } = elevationEvents(cleanAltitudes(alts)!);
    expect(gain).toBeGreaterThan(50);
    expect(gain).toBeLessThan(70);
    expect(loss).toBeGreaterThan(50);
    expect(loss).toBeLessThan(70);
  });
  it('hystérésis : sous le seuil rien n’est compté', () => {
    expect(elevationEvents([0, 2, 0, 2, 0], 3).gain).toBe(0);
    expect(elevationEvents([0, 5, 10], 3)).toMatchObject({ gain: 10, loss: 0 });
  });
  it('colline lisse de 40 m : amplitude complète comptée (pas de perte au seuil)', () => {
    const alts = Array.from({ length: 834 }, (_, i) => 20 + 40 * Math.sin((Math.PI * i) / 833));
    expect(elevationEvents(cleanAltitudes(alts)!)).toMatchObject({ gain: 40, loss: 40 });
    // Petite bosse de 2 m au milieu d'une montée : pas de descente comptée.
    expect(elevationEvents([0, 5, 10, 8, 12, 20], 3)).toMatchObject({ gain: 20, loss: 0 });
  });
});

describe('analyse de course', () => {
  it('splits par km : temps, allure, km partiel, dénivelé', () => {
    // 3 m/s → 333 s par km ; 2 500 m ; montée régulière de 1 m tous les 10 m.
    const pts = line(418, 3, 2, { alt: (i) => i * 0.6 });
    const splits = detailedSplits(pts);
    expect(splits).toHaveLength(3);
    expect(splits[0].sec).toBeGreaterThanOrEqual(332);
    expect(splits[0].sec).toBeLessThanOrEqual(334);
    expect(splits[0].paceSec).toBe(splits[0].sec);
    expect(splits[2].partial).toBe(true);
    expect(splits[2].distanceM).toBeGreaterThan(400);
    expect(splits[0].gainM).toBeGreaterThan(90);
    expect(splits[0].gainM).toBeLessThan(110);
    expect(splits.reduce((s, x) => s + x.gainM, 0)).toBeCloseTo(trackElevation(pts)!.gain, -1);
  });
  it('un reste de 990 m+ compte comme km complet (4 998 m = 5 splits pleins)', () => {
    const splits = detailedSplits(line(834, 3, 2)); // 833 × 6 m = 4 998 m
    expect(splits).toHaveLength(5);
    expect(splits.every((s) => !s.partial)).toBe(true);
    expect(splits[4].index).toBe(5);
  });
  it('splits sans altitude : D+ = 0, pas d’erreur', () => {
    expect(detailedSplits(line(400)).every((s) => s.gainM === 0)).toBe(true);
    expect(trackElevation(line(10))).toBeNull();
    expect(elevationProfile(line(10))).toEqual([]);
  });
  it('les pauses ne comptent pas dans le temps des splits', () => {
    const a = line(200, 3, 2);
    const last = a.at(-1)!;
    // Pause de 10 min, reprise au même endroit.
    const b = line(200, 3, 2, { seg: 1, t0: last.t + 600_000 }).map((p) => ({ ...p, lat: p.lat + (last.lat - 33.5) }));
    const splits = detailedSplits([...a, ...b]);
    expect(splits[0].sec).toBeLessThan(340);
    expect(splits[1].sec).toBeLessThan(340);
  });
  it('meilleurs efforts : 400 m, 1 km, 1 mile, 5 km', () => {
    // 6 km à 3 m/s → 400 m en ~133 s, 1 mile en ~536 s, 5 km en ~1 667 s.
    const e = detectBestEfforts(line(1001, 3, 2));
    expect(e['400m']).toBeGreaterThanOrEqual(132);
    expect(e['400m']).toBeLessThanOrEqual(135);
    expect(e['1mi']).toBeGreaterThanOrEqual(535);
    expect(e['1mi']).toBeLessThanOrEqual(538);
    expect(e['5k']).toBeGreaterThan(1660);
    expect(e['10k']).toBeUndefined();
    expect(e.half).toBeUndefined();
  });
  it('classement des efforts : record si meilleur que les courses précédentes', () => {
    const run = { id: 3, date: '2026-10-10', bestEfforts: { '1k': 290, '5k': 1600 } };
    const others = [
      { id: 1, date: '2026-10-01', bestEfforts: { '1k': 280, '5k': 1650 } },
      { id: 2, date: '2026-10-05', bestEfforts: { '1k': 300 } },
      { id: 4, date: '2026-10-20', bestEfforts: { '5k': 1500 } }, // postérieure : ignorée
    ];
    expect(rankEfforts(run, others)).toEqual([
      { key: '1k', sec: 290, rank: 2 },
      { key: '5k', sec: 1600, rank: 1 },
    ]);
  });
  it('records : les 400 m ne sont jamais déduits d’une allure moyenne', () => {
    const recs = runRecords([{ id: 1, date: '2026-10-01', distanceKm: 10, durationSec: 3000 }]);
    expect(recs['400m']).toBeUndefined();
    expect(recs['1mi']).toMatchObject({ sec: 483, measured: false });
    expect(recs['half']).toBeUndefined();
  });
  it('tracé coloré par allure : rapide puis lent → couleurs extrêmes', () => {
    const fast = line(100, 5, 2);
    const slow = line(100, 2.5, 2, { t0: fast.at(-1)!.t + 2000 }).map((p) => ({ ...p, lat: p.lat + (fast.at(-1)!.lat - 33.5) + 1e-5 }));
    const map = paceLines([...fast, ...slow], 5);
    const lines = map.lines;
    expect(map.fast).toBe(200);
    expect(map.slow).toBe(400);
    expect(lines[0].bucket).toBe(0);
    expect(lines.at(-1)!.bucket).toBe(4);
    // Les morceaux sont contigus (pas de trou visuel).
    for (let i = 1; i < lines.length; i++) expect(lines[i].points[0]).toEqual(lines[i - 1].points.at(-1));
    // Allure régulière : une seule couleur.
    expect(new Set(paceLines(fast).lines.map((l) => l.bucket)).size).toBe(1);
  });
  it('simplification : une ligne droite se réduit à 2 points', () => {
    expect(simplify(line(500))).toHaveLength(2);
    const zig = line(50).map((p, i) => ({ ...p, lng: p.lng + (i % 10 === 5 ? 0.001 : 0) }));
    expect(simplify(zig).length).toBeGreaterThan(2);
  });
  it('projection : tracé tenu dans le cadre, nord en haut', () => {
    const px = projectRoute(line(100), 400, 300, 20);
    for (const [x, y] of px) {
      expect(x).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(x).toBeLessThanOrEqual(380 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(y).toBeLessThanOrEqual(280 + 1e-6);
    }
    expect(px[0][1]).toBeGreaterThan(px.at(-1)![1]); // départ au sud = en bas
  });
  it('pause automatique des traces importées', () => {
    const a = line(10, 3, 2);
    const b = line(10, 3, 2, { t0: a.at(-1)!.t + 120_000 }).map((p) => ({ ...p, lat: p.lat + (a.at(-1)!.lat - 33.5) }));
    const out = autoPause([...a, ...b]);
    expect(out[9].seg).toBe(0);
    expect(out[10].seg).toBe(1);
  });
});

describe('VDOT et prédictions', () => {
  it('5 km en 20:00 ≈ VDOT 49,8 (table de Daniels : 19:57 → 50)', () => {
    expect(vdot(5000, 1200)).toBeCloseTo(49.8, 0);
  });
  it('VDOT 50 → prédictions proches des tables de Daniels', () => {
    expect(Math.abs(predictTime(50, 10_000) - (41 * 60 + 21))).toBeLessThan(30);
    expect(Math.abs(predictTime(50, 21_097.5) - (1 * 3600 + 31 * 60 + 35))).toBeLessThan(60);
    expect(Math.abs(predictTime(50, 42_195) - (3 * 3600 + 10 * 60 + 49))).toBeLessThan(120);
  });
  it('prédiction cohérente avec la performance d’origine', () => {
    const v = vdot(10_000, 2700);
    expect(Math.abs(predictTime(v, 10_000) - 2700)).toBeLessThanOrEqual(1);
  });
  it('allures d’entraînement ordonnées (footing > marathon > seuil > VMA > répétitions)', () => {
    const p = trainingPaces(45);
    expect(p.easy[0]).toBeGreaterThan(p.easy[1]);
    expect(p.easy[1]).toBeGreaterThan(p.marathon);
    expect(p.marathon).toBeGreaterThan(p.threshold);
    expect(p.threshold).toBeGreaterThan(p.interval);
    expect(p.interval).toBeGreaterThan(p.repetition);
    expect(paceAtFraction(45, 0.88)).toBe(p.threshold);
  });
  it('meilleur VDOT : ignore les efforts trop courts, anciens ou aberrants', () => {
    const perfs = [
      { distanceM: 400, sec: 60, date: '2026-10-01', label: '400 m' },
      { distanceM: 5000, sec: 1500, date: '2026-10-01', label: '5 km' },
      { distanceM: 10_000, sec: 2700, date: '2026-01-01', label: '10 km' },
      { distanceM: 5000, sec: 600, date: '2026-10-02', label: 'erreur GPS' },
    ];
    const best = bestVdot(perfs, '2026-05-01')!;
    expect(best.from.label).toBe('5 km');
    expect(best.vdot).toBeCloseTo(vdot(5000, 1500), 1);
    expect(bestVdot([])).toBeNull();
  });
});

describe('charge d’entraînement', () => {
  it('intensité : RPE prioritaire, puis allure vs seuil, puis type', () => {
    expect(intensityFactor({ date: 'x', durationSec: 3600, distanceKm: 10, rpe: 5 })).toEqual({ value: 0.8, basis: 'rpe' });
    expect(intensityFactor({ date: 'x', durationSec: 3000, distanceKm: 10 }, 300)).toEqual({ value: 1, basis: 'pace' });
    expect(intensityFactor({ date: 'x', durationSec: 3600, distanceKm: 10, type: 'tempo' })).toEqual({ value: 0.88, basis: 'type' });
  });
  it('1 h au seuil = 100 points', () => {
    expect(runLoad({ date: 'x', durationSec: 3600, distanceKm: 12 }, 300)).toBe(100);
    expect(runLoad({ date: 'x', durationSec: 1800, distanceKm: 5, type: 'easy' })).toBe(26); // 0,5 × 0,72² × 100
  });
  it('CTL/ATL/TSB : la fatigue monte plus vite que la forme, puis la fraîcheur remonte au repos', () => {
    const runs = Array.from({ length: 21 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, durationSec: 3600, distanceKm: 12, rpe: 7 }));
    const s = trainingLoadSeries(runs, '2026-10-31');
    const day21 = s.find((d) => d.date === '2026-10-21')!;
    expect(day21.atl).toBeGreaterThan(day21.ctl);
    expect(day21.tsb).toBeLessThan(0);
    const last = s.at(-1)!;
    expect(last.tsb).toBeGreaterThan(day21.tsb);
    expect(s[0].tsb).toBe(0);
    expect(s).toHaveLength(31);
  });
  it('zones de fraîcheur et rampe', () => {
    expect(formZone(30)).toBe('transition');
    expect(formZone(10)).toBe('fresh');
    expect(formZone(0)).toBe('neutral');
    expect(formZone(-20)).toBe('optimal');
    expect(formZone(-40)).toBe('overload');
    expect(rampRate([])).toBeNull();
  });
});

describe('objectifs et chaussures', () => {
  it('périodes', () => {
    expect(periodRange('week', '2026-10-30')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(periodRange('month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('year', '2026-10-30')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
  it('progression, attendu et projection', () => {
    const runs = [{ date: '2026-10-01', distanceKm: 20 }, { date: '2026-10-10', distanceKm: 10 }, { date: '2026-09-30', distanceKm: 50 }];
    const g = goalProgress('month', 100, runs, '2026-10-15');
    expect(g.doneKm).toBe(30);
    expect(g.pct).toBe(30);
    expect(g.expectedKm).toBeCloseTo(48.4, 1);
    expect(g.projectedKm).toBe(62);
    expect(g.status).toBe('behind');
    expect(g.daysLeft).toBe(16);
    expect(goalProgress('month', 25, runs, '2026-10-15').status).toBe('done');
  });
  it('kilométrage et alerte de remplacement', () => {
    const runs = [{ shoeId: 1, distanceKm: 10 }, { shoeId: 2, distanceKm: 5 }, { distanceKm: 3 }];
    expect(shoeKm({ id: 1, startKm: 590 }, runs)).toBe(600);
    expect(shoeStatus(500)).toBe('ok');
    expect(shoeStatus(600)).toBe('soon');
    expect(shoeStatus(700)).toBe('replace');
    expect(shoeStatus(750, 800)).toBe('soon');
  });
});

describe('annonces vocales', () => {
  it('durées, allures et distances lisibles', () => {
    expect(spokenDuration(942)).toBe('15 minutes 42 secondes');
    expect(spokenDuration(3725)).toBe('1 heure 2 minutes');
    expect(spokenDuration(61)).toBe('1 minute 1 seconde');
    expect(spokenPace(312)).toBe('5 minutes 12 par kilomètre');
    expect(spokenPace(300)).toBe('5 minutes par kilomètre');
    expect(spokenDistance(400)).toBe('400 mètres');
    expect(spokenDistance(1000)).toBe('1 kilomètre');
    expect(spokenDistance(2500)).toBe('2,5 kilomètres');
  });
  it('annonce au km selon les réglages', () => {
    const info = { distanceM: 3000, elapsedSec: 942, splitSec: 310, splitKm: 1, avgPaceSec: 314 };
    expect(distanceAnnouncement(info, DEFAULT_VOICE)).toBe('3 kilomètres. Temps : 15 minutes 42 secondes. Dernier kilomètre : 5 minutes 10 par kilomètre. Allure moyenne : 5 minutes 14 par kilomètre.');
    expect(distanceAnnouncement(info, { ...DEFAULT_VOICE, time: false, splitPace: false })).toBe('3 kilomètres. Allure moyenne : 5 minutes 14 par kilomètre.');
  });
  it('bornes d’annonce', () => {
    expect(announceMark(999, 1)).toBe(0);
    expect(announceMark(1000, 1)).toBe(1);
    expect(announceMark(2600, 0.5)).toBe(5);
  });
});

describe('séances guidées', () => {
  it('développement des répétitions, sans récup finale inutile', () => {
    const steps = expandWorkout(builtinWorkouts()[0]);
    expect(steps).toHaveLength(1 + 8 + 7 + 1);
    expect(steps[1]).toMatchObject({ kind: 'work', rep: 1, reps: 8, value: 400 });
    expect(steps.at(-2)).toMatchObject({ kind: 'work', rep: 8 });
    expect(steps.at(-1)!.kind).toBe('cooldown');
  });
  it('le moteur enchaîne étapes au temps et à la distance', () => {
    const steps = expandWorkout(customWorkout({ name: 'x', warmupMin: 1, reps: 2, workBy: 'distance', workValue: 400, recoverySec: 60, cooldownMin: 0 }));
    expect(steps.map((s) => s.kind)).toEqual(['warmup', 'work', 'recovery', 'work']);
    let st = initialEngine();
    let r = advance(steps, st, 30, 100);
    expect(r.started).toEqual([]);
    r = advance(steps, r.state, 60, 200); // fin échauffement
    expect(r.started).toEqual([1]);
    expect(stepStatus(steps, r.state, 80, 300)).toMatchObject({ remaining: 300 });
    r = advance(steps, r.state, 140, 600); // 400 m faits
    expect(r.started).toEqual([2]);
    r = advance(steps, r.state, 200, 700); // 60 s de récup
    expect(r.started).toEqual([3]);
    r = advance(steps, r.state, 300, 1100);
    expect(r.finished).toBe(true);
    st = r.state;
    expect(stepStatus(steps, st, 300, 1100).step).toBeNull();
  });
  it('plusieurs étapes franchies d’un coup (ex. retour après un rechargement)', () => {
    const steps = expandWorkout(customWorkout({ name: 'x', warmupMin: 1, reps: 3, workBy: 'time', workValue: 30, recoverySec: 30, cooldownMin: 0 }));
    const r = advance(steps, initialEngine(), 140, 0);
    expect(r.started).toEqual([1, 2, 3]);
    // Le temps « en trop » est reporté : l'étape 3 a démarré à 60 + 30 + 30 = 120 s.
    expect(r.state.startSec).toBe(120);
  });
  it('allure : trop rapide / trop lent / OK, alertes espacées', () => {
    expect(paceFeedback(280, 300, 8)).toBe('fast');
    expect(paceFeedback(320, 300, 8)).toBe('slow');
    expect(paceFeedback(305, 300, 8)).toBe('ok');
    expect(paceFeedback(0, 300)).toBeNull();
    expect(shouldAlertPace('fast', 10, null, 10)).toBe(false); // trop tôt dans l'étape
    expect(shouldAlertPace('fast', 25, null, 25)).toBe(true);
    expect(shouldAlertPace('fast', 40, 25, 40)).toBe(false);
    expect(shouldAlertPace('slow', 60, 25, 60)).toBe(true);
    expect(shouldAlertPace('ok', 60, null, 60)).toBe(false);
  });
  it('phrases et totaux', () => {
    const steps = expandWorkout(targetPaceWorkout(5000, 330));
    expect(stepAnnouncement(steps[0])).toBe('Effort : 5 kilomètres à 5 minutes 30 par kilomètre. Go !');
    expect(workoutTotals(steps)).toEqual({ sec: 1650, meters: 5000 });
    const withPaces = builtinWorkouts(trainingPaces(45));
    expect(withPaces[3].blocks[0].steps[1].pace).toBe(trainingPaces(45).threshold);
    expect(builtinWorkouts()[3].blocks[0].steps[1].pace).toBeUndefined();
  });
});

describe('Open-Meteo', () => {
  it('URL : prévisions pour une course récente, archives pour une ancienne', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    expect(weatherUrl(33.57, -7.59, Date.parse('2026-10-28T18:00:00Z'), now)).toContain('https://api.open-meteo.com/v1/forecast?latitude=33.57&longitude=-7.59');
    expect(weatherUrl(33.57, -7.59, Date.parse('2025-03-10T18:00:00Z'), now)).toMatch(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?.*start_date=2025-03-10&end_date=2025-03-10/);
  });
  it('choisit l’heure la plus proche', () => {
    const base = Date.parse('2026-10-28T00:00:00Z') / 1000;
    const json = { hourly: { time: [base + 17 * 3600, base + 18 * 3600, base + 19 * 3600], temperature_2m: [22.4, 21.6, 20.1], apparent_temperature: [23, 22, 20], wind_speed_10m: [12.4, 10, 8], weather_code: [0, 3, 61], relative_humidity_2m: [60, 65, 70], precipitation: [0, 0, 1] } };
    expect(pickWeather(json, Date.parse('2026-10-28T18:20:00Z'))).toEqual({ tempC: 22, feelsC: 22, humidity: 65, windKmh: 10, precipMm: 0, code: 3, at: (base + 18 * 3600) * 1000 });
    expect(pickWeather(json, Date.parse('2026-10-29T18:00:00Z'))).toBeNull();
    expect(pickWeather({}, 0)).toBeNull();
  });
  it('libellés météo', () => {
    expect(weatherLabel(0)).toBe('Ciel dégagé');
    expect(weatherLabel(63)).toBe('Pluie');
    expect(weatherLabel(95)).toBe('Orage');
  });
  it('altitude : échantillonnage, lots de 100, interpolation', () => {
    const pts = line(2000, 3, 2); // 12 km
    const idx = demSampleIndices(pts);
    expect(idx[0]).toBe(0);
    expect(idx.at(-1)).toBe(1999);
    expect(idx.length).toBeLessThanOrEqual(500);
    expect(idx.length).toBeGreaterThan(300);
    const urls = elevationUrls(idx.map((i) => pts[i]));
    expect(urls.length).toBe(Math.ceil(idx.length / 100));
    expect(urls[0].split('latitude=')[1].split('&')[0].split(',')).toHaveLength(100);
    const short = line(5, 3, 2);
    const alts = interpolateAltitudes(short, [0, 4], [10, 20]);
    expect(alts).toEqual([10, 12.5, 15, 17.5, 20]);
  });
});

describe('GPX et FIT', () => {
  it('export puis import GPX : points, segments, altitudes, temps', () => {
    const pts = [...line(5, 3, 2, { alt: (i) => 10 + i }), ...line(3, 3, 2, { seg: 1, t0: 60_000 })];
    const gpx = buildGpx('Footing <matin> & soir', pts.map((p) => ({ ...p, t: p.t + Date.parse('2026-10-20T07:00:00Z') })));
    expect(gpx).toContain('Footing &lt;matin&gt; &amp; soir');
    const back = parseGpx(gpx);
    expect(back.name).toBe('Footing <matin> & soir');
    expect(back.points).toHaveLength(8);
    expect(back.points[0].alt).toBe(10);
    expect(back.points[5].seg).toBe(1);
    expect(back.points[5].alt).toBeUndefined();
    expect(back.points[0].t).toBe(Date.parse('2026-10-20T07:00:00Z'));
    expect(back.points[0].lat).toBeCloseTo(33.5, 6);
  });
  it('GPX de Strava (espace de noms, extensions) accepté', () => {
    const xml = `<?xml version="1.0"?><gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Morning Run</name><type>running</type><trkseg>
      <trkpt lat="33.5" lon="-7.6"><ele>12.4</ele><time>2026-10-20T07:00:00Z</time><extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="x"><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="33.5001" lon="-7.6"><ele>12.8</ele><time>2026-10-20T07:00:04Z</time></trkpt></trkseg></trk></gpx>`;
    const t = parseGpx(xml);
    expect(t.name).toBe('Morning Run');
    expect(t.activity).toBe('running');
    expect(t.points).toHaveLength(2);
  });
  it('GPX invalide, vide, sans temps ou de vélo refusé', () => {
    const code = (xml: string) => {
      try {
        parseGpx(xml);
        return 'ok';
      } catch (e) {
        return (e as TrackImportError).code;
      }
    };
    expect(code('pas du xml')).toBe('invalid');
    expect(code('<gpx></gpx>')).toBe('empty');
    expect(code('<gpx><trk><trkseg><trkpt lat="1" lon="2"></trkpt></trkseg></trk></gpx>')).toBe('noTime');
    expect(code('<gpx><trk><type>cycling</type><trkseg><trkpt lat="1" lon="2"><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>')).toBe('notRun');
  });
  it('FIT : fichier encodé puis relu (enregistrements, altitude, session)', async () => {
    const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);
    const start = new Date('2026-10-20T07:00:00Z');
    const ts = FitEncoder.toFitTimestamp(start);
    const enc = new FitEncoder();
    enc.writeMessage(0, [
      { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 },
      { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 1 },
      { number: 4, size: 4, baseType: FitBaseType.Uint32, value: ts },
    ]);
    for (let i = 0; i < 5; i++) {
      enc.writeMessage(20, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts + i * 2 },
        { number: 0, size: 4, baseType: FitBaseType.Sint32, value: semi(33.5 + i * 0.00005) },
        { number: 1, size: 4, baseType: FitBaseType.Sint32, value: semi(-7.6) },
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: (20 + i + 500) * 5 },
      ], 1);
    }
    enc.writeMessage(18, [
      { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts + 8 },
      { number: 5, size: 1, baseType: FitBaseType.Enum, value: 1 },
      { number: 8, size: 4, baseType: FitBaseType.Uint32, value: 8000 },
      { number: 9, size: 4, baseType: FitBaseType.Uint32, value: 2200 },
    ], 2);
    const bytes = enc.close();
    const track = await parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(track.points).toHaveLength(5);
    expect(track.points[0].t).toBe(start.getTime());
    expect(track.points[0].lat).toBeCloseTo(33.5, 5);
    expect(track.points[4].alt).toBeCloseTo(24, 1);
    expect(track.activity).toBe('running');
    expect(track.timerSec).toBe(8);
    expect(track.distanceM).toBe(22);
  });
  it('FIT de vélo ou sans GPS refusé', () => {
    expect(() => trackFromFitData({ sessions: [{ sport: 'cycling' }], records: [] })).toThrow(TrackImportError);
    expect(() => trackFromFitData({ records: [{ timestamp: new Date() }] })).toThrow(TrackImportError);
  });
  it('fichier FIT corrompu refusé proprement', async () => {
    await expect(parseFit(new Uint8Array([1, 2, 3]).buffer)).rejects.toBeInstanceOf(TrackImportError);
  });
});
