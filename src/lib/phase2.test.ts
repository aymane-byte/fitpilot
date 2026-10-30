import { describe, expect, it } from 'vitest';
import { epley1RM, exerciseRecords, suggestNext, volume, weightIncrement } from './strength';
import { formatDuration, formatPace, paceSecPerKm, parseDuration, runCaloriesEstimate, runRecords, speedKmh } from './running';
import { fastestSegment, filterPoints, haversine, kmSplits, movingTime, rejectReason, totalDistance, type GeoPoint } from './geo';
import { conflictsIfAdded, findConflicts, generateWeek } from './planning';
import { buildIcs } from './ics';

describe('1RM et records', () => {
  it('Epley', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 5)).toBe(116.7);
    expect(epley1RM(80, 10)).toBe(106.7);
    expect(epley1RM(0, 5)).toBe(0);
  });
  it('volume ne compte que les séries faites', () => {
    expect(volume([{ reps: 10, weightKg: 50, done: true }, { reps: 10, weightKg: 50, done: false }])).toBe(500);
  });
  it('records d’un exercice', () => {
    const r = exerciseRecords([
      { reps: 8, weightKg: 80, done: true },
      { reps: 3, weightKg: 90, done: true },
      { reps: 5, weightKg: 100, done: false },
    ])!;
    expect(r.bestWeightKg).toBe(90);
    expect(r.best1RM).toBe(101.3); // 80 × (1 + 8/30) = 101,33
  });
  it('pas de série faite → null', () => {
    expect(exerciseRecords([{ reps: 8, weightKg: 80, done: false }])).toBeNull();
  });
});

describe('surcharge progressive', () => {
  const sets = (reps: number[], w = 60, rpe?: number) => reps.map((r) => ({ reps: r, weightKg: w, rpe, done: true }));
  it('toutes les reps au RPE visé → +poids', () => {
    expect(suggestNext(sets([8, 8, 8], 60, 7.5), { reps: 8, rpe: 8 }, 2.5)).toEqual({ kind: 'increase', weightKg: 62.5, reps: 8 });
  });
  it('reps OK mais RPE trop haut → garder', () => {
    expect(suggestNext(sets([8, 8, 8], 60, 9.5), { reps: 8, rpe: 8 }, 2.5).kind).toBe('keep');
  });
  it('1–2 reps manquées → même poids, viser les reps', () => {
    expect(suggestNext(sets([8, 7, 6]), { reps: 8 }, 2.5)).toEqual({ kind: 'reps', weightKg: 60, reps: 8 });
  });
  it('échec net → baisse ~10 %', () => {
    expect(suggestNext(sets([4, 4, 3]), { reps: 8 }, 2.5)).toEqual({ kind: 'deload', weightKg: 55, reps: 8 });
  });
  it('poids du corps → +1 rep', () => {
    expect(suggestNext(sets([10, 10, 10], 0), { reps: 10 }, 0)).toEqual({ kind: 'reps', weightKg: 0, reps: 11 });
  });
  it('première fois', () => expect(suggestNext([], { reps: 8 }, 2.5).kind).toBe('first'));
  it('incréments', () => {
    expect(weightIncrement('dumbbell', 'chest')).toBe(2);
    expect(weightIncrement('barbell', 'legs')).toBe(5);
    expect(weightIncrement('barbell', 'chest')).toBe(2.5);
  });
});

describe('course', () => {
  it('allure et vitesse', () => {
    expect(paceSecPerKm(5, 25 * 60)).toBe(300);
    expect(formatPace(323)).toBe('5:23');
    expect(formatPace(0)).toBe('–:––');
    expect(speedKmh(10, 3600)).toBe(10);
  });
  it('durées', () => {
    expect(formatDuration(1930)).toBe('32:10');
    expect(formatDuration(3750)).toBe('1:02:30');
    expect(parseDuration('32')).toBe(1920);
    expect(parseDuration('32:10')).toBe(1930);
    expect(parseDuration('1:02:30')).toBe(3750);
    expect(parseDuration('5:75')).toBeUndefined();
    expect(parseDuration('abc')).toBeUndefined();
  });
  it('calories estimées', () => expect(runCaloriesEstimate(78, 5)).toBe(390));
  it('records : segment GPS prioritaire, sinon allure moyenne', () => {
    const recs = runRecords([
      { id: 1, date: '2026-10-01', distanceKm: 5, durationSec: 1500 },
      { id: 2, date: '2026-10-05', distanceKm: 10.2, durationSec: 3264 },
      { id: 3, date: '2026-10-08', distanceKm: 3, durationSec: 960, bestEfforts: { '1k': 280 } },
    ]);
    expect(recs['5k']).toMatchObject({ sec: 1500, runId: 1, measured: false });
    expect(recs['10k']).toMatchObject({ sec: 3200, runId: 2 });
    expect(recs['1k']).toMatchObject({ sec: 280, measured: true });
    expect(recs.longest?.id).toBe(2);
  });
});

/** Ligne droite vers le nord : 1 point toutes les `dt` s à `speed` m/s. */
function track(n: number, speed = 3, dt = 2, seg = 0, t0 = 0, lat0 = 33.5): GeoPoint[] {
  const dLat = (speed * dt) / 111_195;
  return Array.from({ length: n }, (_, i) => ({ t: t0 + i * dt * 1000, lat: lat0 + i * dLat, lng: -7.6, accuracy: 5, seg }));
}

describe('GPS', () => {
  it('haversine ~111 km par degré de latitude', () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
    expect(haversine({ lat: 33.5, lng: -7.6 }, { lat: 33.5, lng: -7.6 })).toBe(0);
  });
  it('rejette les points imprécis, les sauts impossibles et le bruit à l’arrêt', () => {
    const a = { t: 0, lat: 33.5, lng: -7.6, accuracy: 5 };
    expect(rejectReason(a, { ...a, t: 1000, accuracy: 60 })).toBe('accuracy');
    expect(rejectReason(a, { ...a, t: 1000, lat: 33.501 })).toBe('speed'); // 111 m en 1 s
    expect(rejectReason(a, { ...a, t: 1000, lat: 33.500005 })).toBe('jitter'); // 0,5 m
    expect(rejectReason(a, { ...a, t: 2000, lat: 33.5000539 })).toBeNull(); // ~6 m en 2 s
  });
  it('filtre une trace avec un saut aberrant', () => {
    const pts = track(11);
    pts[5] = { ...pts[5], lat: pts[5].lat + 0.01 }; // +1,1 km
    const kept = filterPoints(pts);
    expect(kept.length).toBe(10);
    expect(totalDistance(kept)).toBeCloseTo(60, 0);
  });
  it('les pauses (segments) ne comptent pas de distance', () => {
    const a = track(6, 3, 2, 0);
    const b = track(6, 3, 2, 1, 100_000, 33.6); // reprise 11 km plus loin
    expect(totalDistance([...a, ...b])).toBeCloseTo(60, 0);
    expect(movingTime([...a, ...b])).toBe(20);
  });
  it('meilleur segment et temps au km', () => {
    // 1 200 m à 4 m/s (point toutes les 2 s) → 1 km en 250 s
    const pts = track(151, 4, 2);
    expect(fastestSegment(pts, 1000)).toBeCloseTo(250, -1);
    expect(fastestSegment(pts, 5000)).toBeNull();
    expect(kmSplits(pts)).toEqual([250]);
  });
});

describe('planning', () => {
  const workouts = [
    { title: 'Haut', legsHeavy: false },
    { title: 'Bas', legsHeavy: true },
    { title: 'Full body léger', legsHeavy: false },
  ];
  it('3 muscu + 2 courses : jamais de course le lendemain des jambes', () => {
    const week = generateWeek({ weekStart: '2026-11-02', gymDays: 3, runDays: 2, workouts });
    expect(week.filter((a) => a.kind === 'workout')).toHaveLength(3);
    expect(week.filter((a) => a.kind === 'run')).toHaveLength(2);
    expect(findConflicts(week)).toEqual([]);
    // Chaque jour a au moins une activité (repos inclus)
    expect(new Set(week.map((a) => a.date)).size).toBe(7);
  });
  it('fonctionne pour toutes les fréquences raisonnables sans conflit', () => {
    for (let g = 0; g <= 4; g++)
      for (let r = 0; r <= 3; r++) {
        const week = generateWeek({ weekStart: '2026-11-02', gymDays: g, runDays: r, workouts });
        expect(week.filter((a) => a.kind === 'run')).toHaveLength(r);
        expect(findConflicts(week)).toEqual([]);
      }
  });
  it('signale une course placée le lendemain des jambes', () => {
    const existing = [{ date: '2026-11-04', kind: 'workout' as const, title: 'Bas', legsHeavy: true }];
    const c = conflictsIfAdded(existing, { date: '2026-11-05', kind: 'run', title: 'Footing' });
    expect(c).toEqual([{ type: 'run_after_legs', runDate: '2026-11-05', legsDate: '2026-11-04' }]);
    expect(conflictsIfAdded(existing, { date: '2026-11-06', kind: 'run', title: 'Footing' })).toEqual([]);
  });
  it('récupération 48 h : pas de course dans les 2 jours après les jambes', () => {
    const week = generateWeek({ weekStart: '2026-11-02', gymDays: 3, runDays: 2, workouts, recoveryDays: 2 });
    expect(findConflicts(week, 2)).toEqual([]);
    expect(week.filter((a) => a.kind === 'run')).toHaveLength(2);
    const legs = [{ date: '2026-11-04', kind: 'workout' as const, title: 'Bas', legsHeavy: true }];
    expect(conflictsIfAdded(legs, { date: '2026-11-06', kind: 'run', title: 'F' }, 2)).toHaveLength(1);
    expect(conflictsIfAdded(legs, { date: '2026-11-06', kind: 'run', title: 'F' }, 1)).toHaveLength(0);
  });
  it('une séance sautée ne crée pas de conflit', () => {
    expect(
      findConflicts([
        { date: '2026-11-04', kind: 'workout', title: 'Bas', legsHeavy: true, status: 'skipped' },
        { date: '2026-11-05', kind: 'run', title: 'Footing' },
      ]),
    ).toEqual([]);
  });
});

describe('ics', () => {
  it('produit un calendrier valide avec rappel', () => {
    const ics = buildIcs([{ uid: 'a@fitpilot', date: '2026-11-02', time: '18:30', durationMin: 75, title: 'Muscu, haut du corps', alarmMin: 30 }], new Date('2026-10-30T10:00:00Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261102T183000');
    expect(ics).toContain('DTEND:20261102T194500');
    expect(ics).toContain('SUMMARY:Muscu\\, haut du corps');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('journée entière', () => {
    const ics = buildIcs([{ uid: 'b', date: '2026-12-31', title: 'Repos' }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });
});
