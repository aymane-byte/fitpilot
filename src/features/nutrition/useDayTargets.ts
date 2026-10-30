import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '@/db/db';
import type { Profile } from '@/db/types';
import { addDays, startOfWeek, type ISODate } from '@/lib/dates';
import { dayTargets, type DayTargets } from '@/lib/dayTargets';
import type { Targets } from '@/lib/energy';
import { CYCLING_DEFAULT_PCT } from '@/lib/dayTargets';

/**
 * Jours d'entraînement d'une semaine d'après le planning réel : séances prévues (non sautées)
 * et séances réellement faites (muscu ou course). Sans planning, la fréquence du profil sert de repli.
 */
export async function trainingDays(date: ISODate, profile: Pick<Profile, 'gymDaysPerWeek' | 'runDaysPerWeek'>): Promise<{ isTraining: boolean; count: number; fromPlan: boolean }> {
  const monday = startOfWeek(date);
  const sunday = addDays(monday, 6);
  const [planned, sessions, runs] = await Promise.all([
    db.scheduledActivities.where('date').between(monday, sunday, true, true).filter((a) => a.kind !== 'rest' && a.status !== 'skipped').toArray(),
    db.workoutSessions.where('date').between(monday, sunday, true, true).toArray(),
    db.runs.where('date').between(monday, sunday, true, true).toArray(),
  ]);
  const days = new Set<string>([...planned.map((a) => a.date), ...sessions.map((s) => s.date), ...runs.map((r) => r.date)]);
  if (days.size) return { isTraining: days.has(date), count: days.size, fromPlan: true };
  return { isTraining: false, count: Math.min(7, profile.gymDaysPerWeek + profile.runDaysPerWeek), fromPlan: false };
}

export async function computeDayTargets(date: ISODate, profile: Profile, base: Targets): Promise<DayTargets & { isTraining: boolean; fromPlan: boolean }> {
  const s = await getSettings();
  const td = await trainingDays(date, profile);
  const cycling = s.calorieCycling?.enabled && td.fromPlan ? { enabled: true, pct: s.calorieCycling.pct || CYCLING_DEFAULT_PCT, isTraining: td.isTraining, trainingDays: td.count } : undefined;
  return { ...dayTargets(base, { cycling, ramadan: s.ramadan }), isTraining: td.isTraining, fromPlan: td.fromPlan };
}

export function useDayTargets(date: ISODate, profile: Profile | null | undefined, base: Targets | undefined) {
  return useLiveQuery(async () => (profile && base ? computeDayTargets(date, profile, base) : undefined), [date, profile, base]);
}
