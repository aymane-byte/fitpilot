import { db } from '@/db/db';
import { addDays, daysBetween, toISODate, type ISODate } from '@/lib/dates';
import { buildReport, type Report } from '@/lib/report';
import { latestWeight, targetsFor } from '@/hooks/useData';
import { daysNutrition } from '../nutrition/service';

export async function loadReport(from: ISODate, to: ISODate, today: ISODate): Promise<Report | null> {
  const profile = await db.profile.get('me');
  if (!profile) return null;
  const [measures, runs, sessions, scheduled] = await Promise.all([
    db.bodyMeasurements.orderBy('date').toArray(),
    db.runs.where('date').between(from, to, true, true).toArray(),
    db.workoutSessions.where('date').between(from, to, true, true).filter((s) => s.endedAt !== undefined).toArray(),
    db.scheduledActivities.where('date').between(from, to, true, true).filter((a) => a.kind !== 'rest').toArray(),
  ]);
  const dates = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
  const nutrition = await daysNutrition(dates);
  const current = latestWeight(profile, measures.filter((m) => m.weightKg !== undefined));
  const targets = targetsFor(profile, current);
  return buildReport({
    from,
    to,
    today,
    weights: measures.filter((m) => m.weightKg !== undefined).map((m) => ({ date: m.date, value: m.weightKg! })),
    waists: measures.filter((m) => m.waistCm !== undefined).map((m) => ({ date: m.date, value: m.waistCm! })),
    runs,
    workouts: sessions,
    planned: scheduled.filter((a) => a.date <= today),
    nutrition,
    targets: { kcal: targets.calories, proteinG: targets.proteinG },
    sessionsPerWeek: profile.gymDaysPerWeek + profile.runDaysPerWeek,
    targetWeightKg: profile.targetWeightKg,
    since: toISODate(new Date(profile.createdAt)),
  });
}
