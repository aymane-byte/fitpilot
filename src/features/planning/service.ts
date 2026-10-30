import { db, getSettings } from '@/db/db';
import { recommendedPlanKey } from '@/db/seed/programs';
import type { Profile, ScheduledActivity } from '@/db/types';
import { addDays, todayISO, type ISODate } from '@/lib/dates';
import { buildIcs } from '@/lib/ics';
import { generateWeek } from '@/lib/planning';
import { planWeek, RUN_PLANS } from '@/lib/runPlans';
import type { RunTypeKey } from '@/lib/runTypes';
import { nextPlanProgram } from '../workouts/service';

export const TIME_BY_PREF: Record<Profile['preferredTime'], string> = { morning: '07:00', midday: '12:30', evening: '18:30' };

export const recoveryDaysOf = (hours: number) => Math.max(1, Math.round(hours / 24));

export function weekActivities(weekStart: ISODate) {
  return db.scheduledActivities.where('date').between(weekStart, addDays(weekStart, 6), true, true).toArray();
}

/**
 * Génère la semaine à partir du profil, du plan de muscu actif et du plan de course suivi.
 * Les activités déjà faites ou sautées sont conservées ; seules les « prévues » sont remplacées.
 */
export async function generateAndSave(weekStart: ISODate, profile: Profile, today: ISODate = todayISO()): Promise<void> {
  const settings = await getSettings();
  const planKey = settings.activePlan ?? recommendedPlanKey(profile.gymDaysPerWeek, profile.runDaysPerWeek, profile.gymLevel);
  const programs = await db.programs.where('plan').equals(planKey).sortBy('planOrder');
  // Commence le cycle par la prochaine séance du plan (continuité d'une semaine à l'autre).
  const next = await nextPlanProgram(planKey);
  const startIdx = Math.max(0, programs.findIndex((p) => p.id === next?.id));
  const ordered = [...programs.slice(startIdx), ...programs.slice(0, startIdx)];

  const runPlan = settings.runPlan ? RUN_PLANS.find((p) => p.key === settings.runPlan!.key) : undefined;
  const runWeek = runPlan ? planWeek(runPlan, settings.runPlan!.start, weekStart) : null;
  const runSessions = runWeek?.sessions.slice(0, profile.runDaysPerWeek);

  const week = generateWeek({
    weekStart,
    gymDays: profile.gymDaysPerWeek,
    runDays: profile.runDaysPerWeek,
    workouts: ordered.map((p) => ({ programId: p.id, title: p.name, legsHeavy: p.legsHeavy })),
    runTitles: runSessions?.map((s) => s.title),
    recoveryDays: recoveryDaysOf(settings.recoveryHoursLegsBeforeRun),
  });

  const time = TIME_BY_PREF[profile.preferredTime];
  await db.transaction('rw', db.scheduledActivities, async () => {
    await db.scheduledActivities.where('date').between(today > weekStart ? today : weekStart, addDays(weekStart, 6), true, true).filter((a) => a.status === 'planned').delete();
    const kept = await weekActivities(weekStart);
    let runIdx = 0;
    const rows: ScheduledActivity[] = week
      // Pas d'activité dans le passé (semaine en cours générée en milieu de semaine),
      // et pas de doublon avec une activité déjà faite ou sautée le même jour.
      .filter((a) => a.date >= today && !kept.some((k) => k.date === a.date && k.kind === a.kind))
      .map((a) => {
        const session = a.kind === 'run' ? runSessions?.[runIdx++] : undefined;
        return {
          date: a.date,
          kind: a.kind,
          title: a.title,
          status: 'planned',
          programId: a.programId,
          legsHeavy: a.legsHeavy,
          runType: (session?.type ?? a.runType) as RunTypeKey | undefined,
          notes: session?.detail,
          time: a.kind === 'rest' ? undefined : time,
        };
      });
    await db.scheduledActivities.bulkAdd(rows);
  });
}

export function weekIcs(activities: ScheduledActivity[]): string | null {
  const events = activities
    .filter((a) => a.kind !== 'rest' && a.status === 'planned')
    .map((a) => ({
      uid: `fitpilot-${a.id}-${a.date}@fitpilot.local`,
      date: a.date,
      time: a.time,
      durationMin: a.kind === 'run' ? 45 : 75,
      title: `${a.kind === 'run' ? '🏃' : '🏋️'} ${a.title}`,
      description: a.notes,
      alarmMin: a.time ? 30 : undefined,
    }));
  return events.length ? buildIcs(events) : null;
}
