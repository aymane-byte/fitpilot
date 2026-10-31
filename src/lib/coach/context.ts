// Contexte du coach : résumé compact des données (profil + 14 derniers jours), sans rien de superflu.
import { addDays, daysBetween, type ISODate } from '../dates';
import type { Goal, Targets } from '../energy';
import { findConflicts, type PlanActivity } from '../planning';
import { weeklyTrend, type WeeklyTrend } from '../stats';
import { nutritionReport, type DayNutrition, type NutritionReport } from '../nutrition';
import type { FormZone } from '../load';
import type { MicroKey, MicroTarget, MicroTotal } from '../micros';
import type { ShoeStatus } from '../runGoals';

/** Données complémentaires (course avancée, micronutriments, Ramadan, chaussures). Toutes facultatives. */
export interface CoachExtra {
  load?: { ctl: number; atl: number; tsb: number; zone: FormZone; ramp: number | null } | null;
  vdot?: { value: number; thresholdPace: number; easyPace: number } | null;
  /** Moyenne des 7 derniers jours renseignés, avec les repères du profil. */
  micros?: { avg: Partial<Record<MicroKey, MicroTotal>>; targets: Partial<Record<MicroKey, MicroTarget>>; days: number } | null;
  ramadan?: { suhoor: string; iftar: string; waterMl: number } | null;
  shoes?: { name: string; km: number; alertKm: number; status: ShoeStatus }[];
}

export interface CoachRawData {
  today: ISODate;
  profile: {
    name: string;
    age: number;
    gender: 'male' | 'female';
    heightCm: number;
    goal: Goal;
    targetWeightKg?: number;
    gymDaysPerWeek: number;
    runDaysPerWeek: number;
    gymLevel: string;
    runLevel: string;
    injuries: string;
    allergies: string;
    dietaryPreferences: string;
    supplements: string;
  };
  currentWeightKg: number;
  targets: Targets;
  weights: { date: ISODate; value: number }[];
  nutrition: DayNutrition[]; // 14 derniers jours (jours vides inclus, entries = 0)
  workouts: { date: ISODate; name: string; sets: number; legsHeavy?: boolean }[];
  runs: { date: ISODate; km: number; sec: number; type: string }[];
  scheduled: PlanActivity[]; // semaine en cours et suivante
  extra?: CoachExtra;
}

export interface DayLine {
  d: ISODate;
  kg?: number;
  kcal?: number;
  prot?: number;
  gym?: string;
  runKm?: number;
}

export interface CoachContext {
  raw: CoachRawData;
  trend: WeeklyTrend | null;
  /** Jours entre la première et la dernière pesée. */
  weightSpanDays: number;
  nutrition7: NutritionReport;
  workouts7: number;
  runs7Km: number;
  runs7: number;
  plannedNext7: PlanActivity[];
  /** Jours d'entraînement consécutifs jusqu'à aujourd'hui (muscu ou course). */
  consecutiveTrainingDays: number;
  conflicts: ReturnType<typeof findConflicts>;
  days: DayLine[];
}

export function buildContext(raw: CoachRawData): CoachContext {
  const { today } = raw;
  const from7 = addDays(today, -6);
  // Nutrition : 7 jours TERMINÉS (aujourd'hui exclu, la journée est en cours).
  const last7 = raw.nutrition.filter((d) => d.date >= addDays(today, -7) && d.date < today);
  const trainingDays = new Set([...raw.workouts.map((w) => w.date), ...raw.runs.map((r) => r.date)]);
  let consecutive = 0;
  for (let d = trainingDays.has(today) ? today : addDays(today, -1); trainingDays.has(d); d = addDays(d, -1)) consecutive++;
  const sortedW = [...raw.weights].sort((a, b) => (a.date < b.date ? -1 : 1));

  const days: DayLine[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const line: DayLine = { d };
    const w = raw.weights.filter((x) => x.date === d);
    if (w.length) line.kg = Math.round((w.reduce((s, x) => s + x.value, 0) / w.length) * 10) / 10;
    const n = raw.nutrition.find((x) => x.date === d);
    if (n && n.entries > 0) {
      line.kcal = n.kcal;
      line.prot = Math.round(n.proteinG);
    }
    const g = raw.workouts.filter((x) => x.date === d);
    if (g.length) line.gym = g.map((x) => x.name).join(' + ');
    const r = raw.runs.filter((x) => x.date === d);
    if (r.length) line.runKm = Math.round(r.reduce((s, x) => s + x.km, 0) * 10) / 10;
    days.push(line);
  }

  return {
    raw,
    trend: weeklyTrend(raw.weights, today),
    weightSpanDays: sortedW.length >= 2 ? daysBetween(sortedW[0].date, sortedW.at(-1)!.date) : 0,
    nutrition7: nutritionReport(last7, { kcal: raw.targets.calories, proteinG: raw.targets.proteinG }),
    workouts7: raw.workouts.filter((w) => w.date >= from7).length,
    runs7: raw.runs.filter((r) => r.date >= from7).length,
    runs7Km: Math.round(raw.runs.filter((r) => r.date >= from7).reduce((s, r) => s + r.km, 0) * 10) / 10,
    plannedNext7: raw.scheduled.filter((a) => a.date >= today && a.date <= addDays(today, 6) && a.status !== 'skipped'),
    consecutiveTrainingDays: consecutive,
    conflicts: findConflicts(raw.scheduled.filter((a) => a.date >= today)),
    days,
  };
}

/** Résumé compact envoyé au LLM (JSON sans espaces, quelques centaines de tokens). */
export function compactSummary(ctx: CoachContext): string {
  const p = ctx.raw.profile;
  const t = ctx.raw.targets;
  return JSON.stringify({
    profil: {
      prenom: p.name,
      age: p.age,
      sexe: p.gender === 'male' ? 'H' : 'F',
      tailleCm: p.heightCm,
      poidsKg: ctx.raw.currentWeightKg,
      cibleKg: p.targetWeightKg,
      objectif: p.goal,
      muscuParSem: p.gymDaysPerWeek,
      courseParSem: p.runDaysPerWeek,
      niveauMuscu: p.gymLevel,
      niveauCourse: p.runLevel,
      blessures: p.injuries || undefined,
      allergies: p.allergies || undefined,
      alimentation: p.dietaryPreferences || undefined,
      complements: p.supplements || undefined,
    },
    objectifsJour: { kcal: t.calories, bmr: t.bmr, tdee: t.tdee, proteinesG: t.proteinG, glucidesG: t.carbsG, lipidesG: t.fatG },
    tendancePoids: ctx.trend ? { moy7j: ctx.trend.currentAvg, variationKgSem: ctx.trend.changeKg, variationPctSem: ctx.trend.changePct } : null,
    nutrition7j: { joursNotes: ctx.nutrition7.daysLogged, kcalMoy: ctx.nutrition7.avg.kcal, protMoy: ctx.nutrition7.avg.proteinG },
    entrainement7j: { seancesMuscu: ctx.workouts7, courses: ctx.runs7, km: ctx.runs7Km, joursConsecutifs: ctx.consecutiveTrainingDays },
    prevu7j: ctx.plannedNext7.map((a) => `${a.date} ${a.kind}:${a.title}${a.legsHeavy ? '(jambes)' : ''}`),
    chargeCourse: ctx.raw.extra?.load ? { forme: ctx.raw.extra.load.ctl, fatigue: ctx.raw.extra.load.atl, fraicheur: ctx.raw.extra.load.tsb, rampe7j: ctx.raw.extra.load.ramp } : undefined,
    vdotEstime: ctx.raw.extra?.vdot?.value,
    micros7j: ctx.raw.extra?.micros?.days
      ? Object.fromEntries(Object.entries(ctx.raw.extra.micros.avg).map(([k, v]) => [k, { moy: v!.value, renseigne: v!.coverage }]))
      : undefined,
    ramadan: ctx.raw.extra?.ramadan ?? undefined,
    chaussuresUsees: ctx.raw.extra?.shoes?.filter((s) => s.status !== 'ok').map((s) => `${s.name} ${s.km}/${s.alertKm} km`),
    jours: ctx.days,
  });
}
