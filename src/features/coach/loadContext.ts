import { db, getSettings } from '@/db/db';
import { addDays, startOfWeek, todayISO } from '@/lib/dates';
import { buildContext, type CoachContext } from '@/lib/coach/context';
import { DEFAULT_MODELS, geminiProvider, groqProvider, rulesProvider, type CoachProvider } from '@/lib/coach/providers';
import { latestWeight, targetsFor } from '@/hooks/useData';
import { lastNDays } from '@/lib/nutrition';
import { dayItems, daysNutrition, microsOfItems } from '../nutrition/service';
import { runInsights } from '@/lib/runInsights';
import { averageMicros, microTargets } from '@/lib/micros';
import { shoeKm, shoeStatus } from '@/lib/runGoals';
import type { CoachExtra } from '@/lib/coach/context';

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
  const targets = targetsFor(profile, current);
  return buildContext({
    today,
    profile,
    currentWeightKg: current,
    targets,
    extra: await loadExtra(today, profile, targets),
    weights: weights.map((w) => ({ date: w.date, value: w.weightKg! })),
    nutrition,
    workouts,
    runs: runs.map((r) => ({ date: r.date, km: r.distanceKm, sec: r.durationSec, type: r.type })),
    scheduled,
  });
}

/** Charge (toutes les courses), micronutriments des 7 derniers jours terminés, Ramadan, chaussures. */
async function loadExtra(today: string, profile: { gender: 'male' | 'female'; age: number }, targets: { calories: number; waterMl: number }): Promise<CoachExtra> {
  const [allRuns, shoes, settings] = await Promise.all([db.runs.orderBy('date').toArray(), db.shoes.filter((s) => !s.retired).toArray(), getSettings()]);
  const ins = runInsights(allRuns, today);
  const days = await Promise.all(lastNDays(addDays(today, -1), 7).map(async (d) => Object.values(await dayItems(d)).flat()));
  const logged = days.filter((items) => items.length);
  return {
    load: ins.today && ins.zone ? { ctl: ins.today.ctl, atl: ins.today.atl, tsb: ins.today.tsb, zone: ins.zone, ramp: ins.ramp } : null,
    vdot: ins.vdot && ins.paces ? { value: ins.vdot.vdot, thresholdPace: ins.paces.threshold, easyPace: ins.paces.easy[1] } : null,
    micros: logged.length ? { avg: averageMicros(logged.map((items) => microsOfItems(items))), targets: microTargets(profile, targets.calories), days: logged.length } : null,
    ramadan: settings.ramadan?.enabled ? { suhoor: settings.ramadan.suhoor, iftar: settings.ramadan.iftar, waterMl: targets.waterMl } : null,
    shoes: shoes.map((s) => {
      const km = shoeKm(s, allRuns);
      return { name: s.name, km, alertKm: s.alertKm, status: shoeStatus(km, s.alertKm) };
    }),
  };
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
