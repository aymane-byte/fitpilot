import { db } from '@/db/db';
import type { Exercise, Program, WorkoutSet } from '@/db/types';
import { todayISO } from '@/lib/dates';
import { exerciseRecords, suggestNext, weightIncrement, type Suggestion } from '@/lib/strength';

/** Crée une séance (vide ou à partir d'un programme) et renvoie son id. */
export async function startSession(opts: { programId?: number; scheduledId?: number; name: string }): Promise<number> {
  return db.transaction('rw', [db.workoutSessions, db.workoutSets, db.programExercises], async () => {
    const sessionId = (await db.workoutSessions.add({
      date: todayISO(),
      name: opts.name,
      programId: opts.programId,
      scheduledId: opts.scheduledId,
      startedAt: Date.now(),
    })) as number;
    if (opts.programId !== undefined) {
      const items = await db.programExercises.where('programId').equals(opts.programId).sortBy('order');
      const sets: WorkoutSet[] = [];
      let order = 0;
      for (const pe of items) {
        // Pré-remplit avec la dernière charge utilisée, sinon la charge du programme.
        const last = await lastSessionSets(pe.exerciseId, sessionId);
        const lastWeight = last.length ? Math.max(...last.map((s) => s.weightKg)) : undefined;
        for (let i = 0; i < pe.sets; i++) {
          sets.push({ sessionId, exerciseId: pe.exerciseId, order: order++, reps: pe.reps, weightKg: lastWeight ?? pe.weightKg ?? 0, rpe: undefined, done: false, targetReps: pe.reps, targetRpe: pe.rpe });
        }
      }
      await db.workoutSets.bulkAdd(sets);
    }
    return sessionId;
  });
}

/** Séance en cours (non terminée), s'il y en a une. */
export async function activeSession() {
  return db.workoutSessions.filter((s) => s.endedAt === undefined).last();
}

/** Séries de la dernière séance TERMINÉE contenant cet exercice (hors `excludeSessionId`). */
export async function lastSessionSets(exerciseId: number, excludeSessionId?: number): Promise<WorkoutSet[]> {
  const sets = await db.workoutSets.where('exerciseId').equals(exerciseId).toArray();
  const sessionIds = [...new Set(sets.map((s) => s.sessionId))].filter((id) => id !== excludeSessionId);
  if (!sessionIds.length) return [];
  const sessions = (await db.workoutSessions.bulkGet(sessionIds)).filter((s) => s && s.endedAt !== undefined);
  if (!sessions.length) return [];
  const last = sessions.reduce((a, b) => (b!.startedAt > a!.startedAt ? b : a))!;
  return sets.filter((s) => s.sessionId === last.id && s.done).sort((a, b) => a.order - b.order);
}

export async function suggestionFor(exercise: Exercise, target: { reps: number; rpe?: number }, currentSessionId: number): Promise<{ suggestion: Suggestion; last: WorkoutSet[] }> {
  const last = await lastSessionSets(exercise.id!, currentSessionId);
  return { suggestion: suggestNext(last, target, weightIncrement(exercise.equipment, exercise.category)), last };
}

/** Termine la séance : supprime les séries non validées, marque l'activité planifiée comme faite. */
export async function finishSession(sessionId: number): Promise<void> {
  await db.transaction('rw', [db.workoutSessions, db.workoutSets, db.scheduledActivities], async () => {
    await db.workoutSets.where('sessionId').equals(sessionId).filter((s) => !s.done).delete();
    const session = await db.workoutSessions.get(sessionId);
    await db.workoutSessions.update(sessionId, { endedAt: Date.now() });
    if (session?.scheduledId) await db.scheduledActivities.update(session.scheduledId, { status: 'done' });
    else if (session) {
      // Sinon, on coche la séance muscu prévue ce jour-là (s'il y en a une).
      const planned = await db.scheduledActivities.where('date').equals(session.date).filter((a) => a.kind === 'workout' && a.status === 'planned').first();
      if (planned) await db.scheduledActivities.update(planned.id!, { status: 'done' });
    }
  });
}

export async function deleteSession(sessionId: number): Promise<void> {
  await db.transaction('rw', db.workoutSessions, db.workoutSets, async () => {
    await db.workoutSets.where('sessionId').equals(sessionId).delete();
    await db.workoutSessions.delete(sessionId);
  });
}

export interface PrRow {
  exercise: Exercise;
  bestWeightKg: number;
  bestWeightReps: number;
  best1RM: number;
  date: string;
}

/** Records par exercice, sur les séances terminées. */
export async function allRecords(): Promise<PrRow[]> {
  const sessions = new Map((await db.workoutSessions.toArray()).filter((s) => s.endedAt).map((s) => [s.id!, s]));
  const sets = (await db.workoutSets.toArray()).filter((s) => s.done && sessions.has(s.sessionId));
  const byEx = new Map<number, WorkoutSet[]>();
  for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  const exercises = new Map((await db.exercises.bulkGet([...byEx.keys()])).filter(Boolean).map((e) => [e!.id!, e!]));
  const rows: PrRow[] = [];
  for (const [exId, list] of byEx) {
    const rec = exerciseRecords(list);
    const exercise = exercises.get(exId);
    if (!rec || !exercise) continue;
    const bestSet = list.filter((s) => s.weightKg === rec.bestWeightKg).sort((a, b) => sessions.get(a.sessionId)!.startedAt - sessions.get(b.sessionId)!.startedAt)[0];
    rows.push({ exercise, ...rec, date: sessions.get(bestSet.sessionId)!.date });
  }
  return rows.sort((a, b) => b.best1RM - a.best1RM);
}

/**
 * Records battus pendant cette séance (charge max ou 1RM estimé supérieur à tout l'historique).
 */
export async function sessionPrs(sessionId: number): Promise<{ exerciseId: number; kind: 'weight' | '1rm'; value: number }[]> {
  const current = (await db.workoutSets.where('sessionId').equals(sessionId).toArray()).filter((s) => s.done);
  const out: { exerciseId: number; kind: 'weight' | '1rm'; value: number }[] = [];
  const finished = new Set((await db.workoutSessions.toArray()).filter((s) => s.endedAt && s.id !== sessionId).map((s) => s.id));
  for (const exId of new Set(current.map((s) => s.exerciseId))) {
    const mine = exerciseRecords(current.filter((s) => s.exerciseId === exId));
    const before = (await db.workoutSets.where('exerciseId').equals(exId).toArray()).filter((s) => s.done && finished.has(s.sessionId));
    if (!mine || !before.length) continue;
    const prev = exerciseRecords(before)!;
    if (mine.bestWeightKg > prev.bestWeightKg) out.push({ exerciseId: exId, kind: 'weight', value: mine.bestWeightKg });
    else if (mine.best1RM > prev.best1RM) out.push({ exerciseId: exId, kind: '1rm', value: mine.best1RM });
  }
  return out;
}

/** Prochaine séance du plan : celle qui suit la dernière séance terminée de ce plan. */
export async function nextPlanProgram(planKey: string): Promise<Program | undefined> {
  const programs = await db.programs.where('plan').equals(planKey).sortBy('planOrder');
  if (!programs.length) return undefined;
  const ids = new Set(programs.map((p) => p.id));
  const sessions = (await db.workoutSessions.orderBy('startedAt').toArray()).filter((s) => s.endedAt && s.programId !== undefined && ids.has(s.programId));
  const last = sessions.at(-1);
  if (!last) return programs[0];
  const idx = programs.findIndex((p) => p.id === last.programId);
  return programs[(idx + 1) % programs.length];
}

