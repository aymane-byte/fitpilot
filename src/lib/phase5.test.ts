import { describe, expect, it } from 'vitest';
import { buildReport, periodBounds, slopePerDay } from './report';
import { reminders } from './reminders';
import { addDays } from './dates';

const base = {
  from: '2026-10-26',
  to: '2026-11-01',
  today: '2026-11-01',
  weights: [] as { date: string; value: number }[],
  waists: [] as { date: string; value: number }[],
  runs: [] as { date: string; distanceKm: number; durationSec: number }[],
  workouts: [] as { date: string }[],
  planned: [] as { date: string; status: 'planned' | 'done' | 'skipped' }[],
  nutrition: [],
  targets: { kcal: 2440, proteinG: 156 },
  sessionsPerWeek: 5,
};

describe('rapport', () => {
  it('poids moyen, variation, tour de taille', () => {
    const r = buildReport({
      ...base,
      weights: [{ date: '2026-10-26', value: 78.4 }, { date: '2026-10-29', value: 78 }, { date: '2026-11-01', value: 77.8 }, { date: '2026-10-10', value: 90 }],
      waists: [{ date: '2026-10-26', value: 85 }, { date: '2026-11-01', value: 84 }],
    });
    expect(r.avgWeight).toBe(78.07);
    expect(r.weightChange).toBe(-0.6);
    expect(r.waistChange).toBe(-1);
  });
  it('course : distance, allure moyenne pondérée', () => {
    const r = buildReport({ ...base, runs: [{ date: '2026-10-27', distanceKm: 5, durationSec: 1500 }, { date: '2026-10-31', distanceKm: 10, durationSec: 3300 }] });
    expect(r.runKm).toBe(15);
    expect(r.avgPaceSec).toBe(320); // 4800 s / 15 km
  });
  it('régularité basée sur le planning', () => {
    const r = buildReport({ ...base, planned: [{ date: '2026-10-26', status: 'done' }, { date: '2026-10-28', status: 'skipped' }, { date: '2026-10-30', status: 'done' }, { date: '2026-10-31', status: 'planned' }] });
    expect(r.consistencyPct).toBe(50);
  });
  it('sans planning : séances faites / fréquence du profil', () => {
    const r = buildReport({ ...base, workouts: [{ date: '2026-10-26' }, { date: '2026-10-28' }], runs: [{ date: '2026-10-29', distanceKm: 5, durationSec: 1600 }] });
    expect(r.sessionsExpected).toBe(5);
    expect(r.consistencyPct).toBe(60);
  });
  it('nouvel utilisateur : séances attendues à partir de l’inscription', () => {
    const r = buildReport({ ...base, since: '2026-11-01' });
    expect(r.sessionsExpected).toBe(1); // 5/sem × 1 jour ≈ 0,7 → 1
    expect(buildReport({ ...base, since: '2026-01-01' }).sessionsExpected).toBe(5);
  });
  it('les jours futurs ne comptent pas', () => {
    const r = buildReport({ ...base, today: '2026-10-28', workouts: [{ date: '2026-10-30' }] });
    expect(r.days).toBe(3);
    expect(r.workoutsDone).toBe(0);
  });
  it('pente et estimation d’arrivée au poids cible', () => {
    const weights = Array.from({ length: 28 }, (_, i) => ({ date: addDays('2026-10-05', i), value: 80 - (0.5 / 7) * i }));
    expect(slopePerDay(weights)! * 7).toBeCloseTo(-0.5, 5);
    const r = buildReport({ ...base, from: '2026-10-05', to: '2026-11-01', weights, targetWeightKg: 75 });
    expect(r.weeklyRateKg).toBe(-0.5);
    // dernier poids ≈ 78,07 → 3,07 kg à perdre à 0,5 kg/sem → 7 semaines
    expect(r.weeksToTarget).toBe(7);
  });
  it('mauvaise direction → pas d’estimation', () => {
    const weights = [{ date: '2026-10-26', value: 78 }, { date: '2026-11-01', value: 79 }];
    expect(buildReport({ ...base, weights, targetWeightKg: 75 }).weeksToTarget).toBeNull();
  });
  it('bornes de semaine et de mois', () => {
    expect(periodBounds('week', '2026-10-30')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(periodBounds('week', '2026-10-30', -1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(periodBounds('month', '2026-10-30')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodBounds('month', '2026-01-15', -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('rappels in-app', () => {
  const now = new Date('2026-10-30T08:00:00').getTime();
  const r = (over: object = {}) => reminders({ today: '2026-10-30', hour: 8, weighedToday: false, now, hasProfileForDays: 30, lastBackupAt: now, lastMeasureDate: '2026-10-28', lastPhotoDate: '2026-10-20', ...over }).map((x) => x.key);
  it('séance prévue et pesée du matin', () => {
    expect(r({ planned: { title: 'Haut', time: '18:30', status: 'planned' } })).toEqual(['session', 'weigh']);
  });
  it('pas de rappel de pesée l’après-midi ou si déjà fait', () => {
    expect(r({ hour: 15 })).toEqual([]);
    expect(r({ weighedToday: true })).toEqual([]);
  });
  it('sauvegarde, mesures, photo', () => {
    expect(r({ lastBackupAt: now - 8 * 86_400_000, lastMeasureDate: '2026-10-20', lastPhotoDate: undefined, weighedToday: true })).toEqual(['backup', 'measure', 'photo']);
  });
  it('nouvel utilisateur : pas de rappel de mesures dès le premier jour', () => {
    expect(r({ hasProfileForDays: 0, lastBackupAt: undefined, lastMeasureDate: undefined, lastPhotoDate: undefined, weighedToday: true })).toEqual([]);
  });
  it('séance déjà faite → pas de rappel', () => {
    expect(r({ planned: { title: 'Haut', status: 'done' }, weighedToday: true })).toEqual([]);
  });
});
