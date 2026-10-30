import { describe, expect, it } from 'vitest';
import { activityStreak, dailyAverages, movingAverage, weeklyTrend } from './stats';
import { addDays, daysBetween, startOfWeek } from './dates';

describe('dates', () => {
  it('addDays traverse les mois', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('startOfWeek renvoie le lundi', () => {
    expect(startOfWeek('2026-10-30')).toBe('2026-10-26'); // vendredi → lundi
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // dimanche → lundi
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
  });
});

describe('moyenne mobile', () => {
  it('moyenne plusieurs pesées du même jour', () => {
    expect(dailyAverages([{ date: '2026-10-01', value: 78 }, { date: '2026-10-01', value: 79 }])).toEqual([
      { date: '2026-10-01', value: 78.5 },
    ]);
  });

  it('fenêtre de 7 jours calendaires', () => {
    const entries = [
      { date: '2026-10-01', value: 80 },
      { date: '2026-10-04', value: 79 },
      { date: '2026-10-07', value: 78 },
      { date: '2026-10-08', value: 77 }, // le 01 sort de la fenêtre
    ];
    const ma = movingAverage(entries);
    expect(ma.map((p) => p.value)).toEqual([80, 79.5, 79, 78]);
  });
});

describe('weeklyTrend', () => {
  it('compare les deux dernières semaines', () => {
    const entries = [
      { date: '2026-10-17', value: 79 },
      { date: '2026-10-20', value: 79 },
      { date: '2026-10-25', value: 78.5 },
      { date: '2026-10-30', value: 78.3 },
    ];
    const t = weeklyTrend(entries, '2026-10-30')!;
    expect(t.currentAvg).toBe(78.4);
    expect(t.previousAvg).toBe(79);
    expect(t.changeKg).toBe(-0.6);
  });
  it('sans données récentes → null', () => {
    expect(weeklyTrend([{ date: '2026-09-01', value: 80 }], '2026-10-30')).toBeNull();
  });
  it('pas de semaine précédente → variation null', () => {
    const t = weeklyTrend([{ date: '2026-10-30', value: 78 }], '2026-10-30')!;
    expect(t.changeKg).toBeNull();
  });
});

describe('activityStreak', () => {
  it('compte les jours consécutifs jusqu’à aujourd’hui', () => {
    expect(activityStreak(['2026-10-28', '2026-10-29', '2026-10-30'], '2026-10-30')).toBe(3);
  });
  it('ne casse pas la série si rien encore aujourd’hui', () => {
    expect(activityStreak(['2026-10-28', '2026-10-29'], '2026-10-30')).toBe(2);
  });
  it('les jours de repos planifiés ne cassent pas la série', () => {
    expect(activityStreak(['2026-10-27', '2026-10-29'], '2026-10-30', ['2026-10-28'])).toBe(2);
  });
  it('série cassée', () => {
    expect(activityStreak(['2026-10-25'], '2026-10-30')).toBe(0);
  });
});
