import { db, getSettings } from '@/db/db';
import { addDays, startOfWeek, todayISO } from '@/lib/dates';
import { buildContext, type CoachContext } from '@/lib/coach/context';
import { DEFAULT_MODELS, geminiProvider, groqProvider, rulesProvider, type CoachProvider } from '@/lib/coach/providers';
import { latestWeight, targetsFor } from '@/hooks/useData';
import { lastNDays } from '@/lib/nutrition';
import { daysNutrition } from '../nutrition/service';

/** Rassemble les 28 derniers jours de données et construit le contexte du coach. */
export async function loadCoachContext(today = todayISO()): Promise<CoachContext | null> {
  const profile = await db.profile.get('me');
  if (!profile) return null;
  const from = addDays(today, -27);
  const [measurements, nutrition, sessions, runs, scheduled] = await Promise.all([
    db.bodyMeasurements.where('date').between(from, today, true, true).toArray(),
    daysNutrition(lastNDays(today, 14)),
    db.workoutSessions.where('date').between(addDays(today, -13), today, true, true).filter((s) => s.endedAt !== undefined).toArray(),
    db.runs.where('date').between(addDays(today, -13), today, true, true).toArray(),
    db.scheduledActivities.where('date').between(startOfWeek(today), addDays(startOfWeek(today), 13), true, true).toArray(),
  ]);
  const weights = measurements.filter((m) => m.weightKg !== undefined);
  const allWeights = await db.bodyMeasurements.orderBy('date').toArray();
  const current = latestWeight(profile, allWeights.filter((m) => m.weightKg !== undefined));
  const programs = new Map((await db.programs.toArray()).map((p) => [p.id!, p]));
  const workouts = await Promise.all(
    sessions.map(async (s) => ({
      date: s.date,
      name: s.name,
      sets: await db.workoutSets.where('sessionId').equals(s.id!).count(),
      legsHeavy: s.programId !== undefined ? programs.get(s.programId)?.legsHeavy : undefined,
    })),
  );
  return buildContext({
    today,
    profile,
    currentWeightKg: current,
    targets: targetsFor(profile, current),
    weights: weights.map((w) => ({ date: w.date, value: w.weightKg! })),
    nutrition,
    workouts,
    runs: runs.map((r) => ({ date: r.date, km: r.distanceKm, sec: r.durationSec, type: r.type })),
    scheduled,
  });
}

export async function exerciseInfos() {
  return (await db.exercises.toArray()).map((e) => ({ name: e.name, muscles: e.muscles, instructions: e.instructions, mistakes: e.mistakes }));
}

/** Fournisseur actif d'après les réglages (règles par défaut). */
export async function activeProvider(): Promise<{ provider: CoachProvider; model?: string }> {
  const s = await getSettings();
  if (s.coachProvider === 'gemini') {
    const model = s.geminiModel || DEFAULT_MODELS.gemini;
    return { provider: geminiProvider({ apiKey: s.geminiApiKey, model, proxyUrl: s.proxyUrl }), model };
  }
  if (s.coachProvider === 'groq') {
    const model = s.groqModel || DEFAULT_MODELS.groq;
    return { provider: groqProvider({ apiKey: s.groqApiKey, model, proxyUrl: s.proxyUrl }), model };
  }
  return { provider: rulesProvider(await exerciseInfos()) };
}
