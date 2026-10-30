// Objectifs de distance (semaine / mois / année) et kilométrage des chaussures.
import { addDays, daysBetween, startOfWeek, type ISODate } from './dates';

export type GoalPeriod = 'week' | 'month' | 'year';
export const GOAL_TYPES: Record<GoalPeriod, string> = { week: 'run_week_km', month: 'run_month_km', year: 'run_year_km' };

export function periodRange(period: GoalPeriod, today: ISODate): { start: ISODate; end: ISODate } {
  if (period === 'week') {
    const start = startOfWeek(today);
    return { start, end: addDays(start, 6) };
  }
  const y = Number(today.slice(0, 4));
  if (period === 'year') return { start: `${y}-01-01`, end: `${y}-12-31` };
  const m = Number(today.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

export interface GoalProgress {
  doneKm: number;
  target: number;
  pct: number;
  /** Km « attendus » à ce stade si l'objectif était réparti uniformément. */
  expectedKm: number;
  /** Projection en fin de période au rythme actuel. */
  projectedKm: number;
  remainingKm: number;
  daysLeft: number;
  status: 'done' | 'ahead' | 'behind';
}

export function goalProgress(period: GoalPeriod, target: number, runs: { date: ISODate; distanceKm: number }[], today: ISODate): GoalProgress {
  const { start, end } = periodRange(period, today);
  const doneKm = Math.round(runs.filter((r) => r.date >= start && r.date <= end).reduce((s, r) => s + r.distanceKm, 0) * 10) / 10;
  const totalDays = daysBetween(start, end) + 1;
  const elapsed = daysBetween(start, today) + 1;
  const expectedKm = Math.round(((target * elapsed) / totalDays) * 10) / 10;
  const projectedKm = Math.round(((doneKm * totalDays) / elapsed) * 10) / 10;
  return {
    doneKm,
    target,
    pct: target > 0 ? Math.min(100, Math.round((doneKm / target) * 100)) : 0,
    expectedKm,
    projectedKm,
    remainingKm: Math.max(0, Math.round((target - doneKm) * 10) / 10),
    daysLeft: totalDays - elapsed,
    status: doneKm >= target ? 'done' : doneKm >= expectedKm ? 'ahead' : 'behind',
  };
}

/** Une paire est en général à remplacer entre 600 et 800 km (amorti écrasé). */
export const SHOE_DEFAULT_ALERT_KM = 700;
export const SHOE_WARN_BEFORE_KM = 100;

export function shoeKm(shoe: { id?: number; startKm?: number }, runs: { shoeId?: number; distanceKm: number }[]): number {
  const used = runs.filter((r) => r.shoeId !== undefined && r.shoeId === shoe.id).reduce((s, r) => s + r.distanceKm, 0);
  return Math.round(((shoe.startKm ?? 0) + used) * 10) / 10;
}

export type ShoeStatus = 'ok' | 'soon' | 'replace';

export function shoeStatus(km: number, alertKm = SHOE_DEFAULT_ALERT_KM): ShoeStatus {
  if (km >= alertKm) return 'replace';
  if (km >= alertKm - SHOE_WARN_BEFORE_KM) return 'soon';
  return 'ok';
}
