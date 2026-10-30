// Agrégations de séries temporelles : moyenne mobile du poids, tendance, série d'entraînement.
import { addDays, daysBetween, type ISODate } from './dates';

export interface DatedValue {
  date: ISODate;
  value: number;
}

/** Une valeur par jour (moyenne des mesures du même jour), triée par date. */
export function dailyAverages(entries: DatedValue[]): DatedValue[] {
  const byDay = new Map<ISODate, { sum: number; n: number }>();
  for (const e of entries) {
    const acc = byDay.get(e.date) ?? { sum: 0, n: 0 };
    acc.sum += e.value;
    acc.n += 1;
    byDay.set(e.date, acc);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, { sum, n }]) => ({ date, value: sum / n }));
}

/**
 * Moyenne mobile sur `window` jours calendaires : pour chaque jour mesuré,
 * moyenne des mesures des `window` derniers jours (jours sans mesure ignorés).
 */
export function movingAverage(entries: DatedValue[], window = 7): DatedValue[] {
  const daily = dailyAverages(entries);
  return daily.map((point, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0; j--) {
      if (daysBetween(daily[j].date, point.date) >= window) break;
      sum += daily[j].value;
      n++;
    }
    return { date: point.date, value: Math.round((sum / n) * 100) / 100 };
  });
}

export interface WeeklyTrend {
  currentAvg: number;
  previousAvg: number | null;
  /** Variation en kg/semaine (null si pas assez de données sur la semaine précédente). */
  changeKg: number | null;
  /** Variation en % du poids. */
  changePct: number | null;
}

/** Compare la moyenne des 7 derniers jours (jusqu'à `today`) à celle des 7 jours précédents. */
export function weeklyTrend(entries: DatedValue[], today: ISODate): WeeklyTrend | null {
  const daily = dailyAverages(entries);
  const avg = (from: ISODate, to: ISODate) => {
    const vals = daily.filter((d) => d.date >= from && d.date <= to).map((d) => d.value);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const current = avg(addDays(today, -6), today);
  if (current === null) return null;
  const previous = avg(addDays(today, -13), addDays(today, -7));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    currentAvg: r2(current),
    previousAvg: previous === null ? null : r2(previous),
    changeKg: previous === null ? null : r2(current - previous),
    changePct: previous === null ? null : r2(((current - previous) / previous) * 100),
  };
}

/**
 * Série de jours actifs consécutifs se terminant aujourd'hui (ou hier, pour ne pas
 * casser la série avant la séance du jour). Un jour de repos planifié ne casse pas la série
 * s'il figure dans `restDays`.
 */
export function activityStreak(activeDays: ISODate[], today: ISODate, restDays: ISODate[] = []): number {
  const active = new Set(activeDays);
  const rest = new Set(restDays);
  let day = active.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (active.has(day) || rest.has(day)) {
    if (active.has(day)) streak++;
    day = addDays(day, -1);
  }
  return streak;
}
