// Rapports hebdo / mensuels : agrégations pures sur une période.
import { addDays, daysBetween, type ISODate } from './dates';
import { dailyAverages, type DatedValue } from './stats';
import { nutritionReport, type DayNutrition } from './nutrition';

export interface ReportInput {
  from: ISODate;
  to: ISODate; // inclus
  today: ISODate;
  weights: DatedValue[];
  waists: DatedValue[];
  runs: { date: ISODate; distanceKm: number; durationSec: number }[];
  workouts: { date: ISODate }[];
  /** Activités planifiées (hors repos) de la période. */
  planned: { date: ISODate; status: 'planned' | 'done' | 'skipped' }[];
  nutrition: DayNutrition[];
  targets: { kcal: number; proteinG: number };
  /** Séances prévues par semaine d'après le profil (si rien n'est planifié). */
  sessionsPerWeek: number;
  targetWeightKg?: number;
  /** Date de création du profil : les jours précédents ne comptent pas dans les séances attendues. */
  since?: ISODate;
}

export interface Report {
  days: number;
  avgWeight: number | null;
  weightChange: number | null;
  waistChange: number | null;
  runKm: number;
  runCount: number;
  avgPaceSec: number | null;
  workoutsDone: number;
  sessionsDone: number;
  sessionsExpected: number;
  /** Régularité en % (séances faites / prévues), plafonnée à 100. */
  consistencyPct: number | null;
  avgKcal: number | null;
  avgProtein: number | null;
  daysLogged: number;
  /** Pente de poids (kg/semaine) par régression linéaire sur la période. */
  weeklyRateKg: number | null;
  /** Semaines estimées pour atteindre le poids cible au rythme actuel (null si pas dans la bonne direction). */
  weeksToTarget: number | null;
}

const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pente (unités/jour) des moindres carrés sur des valeurs datées. */
export function slopePerDay(points: DatedValue[]): number | null {
  const daily = dailyAverages(points);
  if (daily.length < 2) return null;
  const x0 = daily[0].date;
  const xs = daily.map((p) => daysBetween(x0, p.date));
  const ys = daily.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (den === 0) return null;
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den;
}

function change(points: DatedValue[]): number | null {
  const daily = dailyAverages(points);
  if (daily.length < 2) return null;
  return r2(daily.at(-1)!.value - daily[0].value);
}

export function buildReport(input: ReportInput): Report {
  const { from, to } = input;
  // La période ne compte pas les jours futurs.
  const end = input.today < to ? input.today : to;
  const w = input.weights.filter((p) => inRange(p.date, from, end));
  const waist = input.waists.filter((p) => inRange(p.date, from, end));
  const runs = input.runs.filter((r) => inRange(r.date, from, end));
  const workouts = input.workouts.filter((s) => inRange(s.date, from, end));
  const planned = input.planned.filter((a) => inRange(a.date, from, end));
  const nutrition = nutritionReport(input.nutrition.filter((d) => inRange(d.date, from, end)), input.targets);
  const days = Math.max(1, daysBetween(from, end) + 1);

  const runKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const runSec = runs.reduce((s, r) => s + r.durationSec, 0);
  const sessionsDone = workouts.length + runs.length;
  const activeFrom = input.since && input.since > from ? input.since : from;
  const activeDays = Math.max(0, daysBetween(activeFrom, end) + 1);
  const sessionsExpected = planned.length ? planned.length : Math.round((input.sessionsPerWeek * activeDays) / 7);
  const plannedDone = planned.filter((p) => p.status === 'done').length;
  const consistency = planned.length ? (plannedDone / planned.length) * 100 : sessionsExpected ? (sessionsDone / sessionsExpected) * 100 : null;

  const slope = slopePerDay(w);
  const weeklyRate = slope === null ? null : r2(slope * 7);
  const lastWeight = dailyAverages(w).at(-1)?.value;
  let weeksToTarget: number | null = null;
  if (weeklyRate && input.targetWeightKg && lastWeight !== undefined) {
    const gap = input.targetWeightKg - lastWeight;
    if (Math.abs(gap) < 0.3) weeksToTarget = 0;
    else if (Math.sign(gap) === Math.sign(weeklyRate)) weeksToTarget = Math.ceil(gap / weeklyRate);
  }

  return {
    days,
    avgWeight: w.length ? r2(w.reduce((s, p) => s + p.value, 0) / w.length) : null,
    weightChange: change(w),
    waistChange: change(waist),
    runKm: r2(runKm),
    runCount: runs.length,
    avgPaceSec: runKm > 0 ? Math.round(runSec / runKm) : null,
    workoutsDone: workouts.length,
    sessionsDone,
    sessionsExpected,
    consistencyPct: consistency === null ? null : Math.min(100, Math.round(consistency)),
    avgKcal: nutrition.daysLogged ? nutrition.avg.kcal : null,
    avgProtein: nutrition.daysLogged ? nutrition.avg.proteinG : null,
    daysLogged: nutrition.daysLogged,
    weeklyRateKg: weeklyRate,
    weeksToTarget,
  };
}

/** Bornes de la période : semaine (lundi → dimanche) ou mois civil, décalées de `offset`. */
export function periodBounds(kind: 'week' | 'month', today: ISODate, offset = 0): { from: ISODate; to: ISODate } {
  const [y, m, d] = today.split('-').map(Number);
  if (kind === 'week') {
    const date = new Date(y, m - 1, d);
    const monday = addDays(today, -((date.getDay() + 6) % 7) + offset * 7);
    return { from: monday, to: addDays(monday, 6) };
  }
  const first = new Date(y, m - 1 + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}
