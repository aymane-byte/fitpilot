// Moteur de règles local (fournisseur « rules » par défaut) : analyse les vraies données,
// sans IA, sans réseau. Chaque règle est une fonction pure testable.
import { fmt, num, signed, t } from '@/i18n';
import { addDays, formatDateFr } from '../dates';
import { bmi, type Goal } from '../energy';
import { normalizeText } from '../text';
import { formatPace } from '../running';
import { microStatus } from '../micros';
import type { CoachContext } from './context';
import { FOOD_QUESTION, foodAdvice } from './foodAdvice';

const R = t.rules;

export type InsightLevel = 'good' | 'info' | 'warn';
export interface Insight {
  id: string;
  level: InsightLevel;
  text: string;
}

/** Zone de variation de poids visée (% du poids par semaine), par objectif. */
export const TARGET_RATE: Record<Goal, [number, number]> = {
  fat_loss: [-1, -0.5],
  recomp: [-0.5, 0],
  muscle_gain: [0.1, 0.5],
  maintenance: [-0.25, 0.25],
  endurance: [-0.25, 0.25],
};

export const ADJUST_STEP = 150;
export const MIN_LOGGED_DAYS = 4;
export const MIN_PROTEIN_DAYS = 3;

export interface CalorieAdvice {
  kind: 'need_logs' | 'need_trend' | 'keep' | 'too_fast' | 'down' | 'up' | 'floor';
  suggestedKcal: number;
  delta: number;
}

/**
 * Ajustement calorique d'après la tendance de poids réelle (2 semaines) et l'objectif.
 * Garde-fous : jamais sous le BMR ; perte > 1 %/sem → on remonte.
 */
export function calorieAdvice(ctx: CoachContext): CalorieAdvice {
  const { targets, profile } = ctx.raw;
  const base = targets.calories;
  if (ctx.nutrition7.daysLogged < MIN_LOGGED_DAYS) return { kind: 'need_logs', suggestedKcal: base, delta: 0 };
  const pct = ctx.trend?.changePct;
  if (pct === null || pct === undefined || ctx.weightSpanDays < 13) return { kind: 'need_trend', suggestedKcal: base, delta: 0 };
  const [min, max] = TARGET_RATE[profile.goal];
  if (pct < -1) return { kind: 'too_fast', suggestedKcal: base + ADJUST_STEP, delta: ADJUST_STEP };
  if (pct > max) {
    const next = base - ADJUST_STEP;
    if (next < targets.bmr) return { kind: 'floor', suggestedKcal: Math.max(base, targets.bmr), delta: 0 };
    return { kind: 'down', suggestedKcal: next, delta: -ADJUST_STEP };
  }
  if (pct < min) return { kind: 'up', suggestedKcal: base + ADJUST_STEP, delta: ADJUST_STEP };
  return { kind: 'keep', suggestedKcal: base, delta: 0 };
}

function calorieText(ctx: CoachContext): string {
  const a = calorieAdvice(ctx);
  const { targets, profile } = ctx.raw;
  const [min, max] = TARGET_RATE[profile.goal];
  const pct = ctx.trend?.changePct ?? 0;
  const vars = { kcal: num(a.suggestedKcal, 0), delta: Math.abs(a.delta), pct: signed(pct, 2), min: signed(min, 2), max: signed(max, 2), goal: t.options.goal[profile.goal], bmr: targets.bmr, n: ctx.nutrition7.daysLogged };
  const main = {
    need_logs: R.adjNeedLogs,
    need_trend: R.adjNeedTrend,
    keep: R.adjKeep,
    too_fast: R.adjTooFast,
    down: R.adjDown,
    up: R.adjUp,
    floor: R.adjFloor,
  }[a.kind];
  const eaten = ctx.nutrition7.daysLogged ? ' ' + fmt(R.adjAvgEaten, { kcal: num(ctx.nutrition7.avg.kcal, 0), target: num(targets.calories, 0) }) : '';
  return fmt(main, vars) + eaten;
}

export function proteinInsight(ctx: CoachContext): Insight {
  const target = ctx.raw.targets.proteinG;
  if (ctx.nutrition7.daysLogged < MIN_PROTEIN_DAYS) return { id: 'protein', level: 'info', text: fmt(R.proteinNoData, { target, n: ctx.nutrition7.daysLogged }) };
  const avg = ctx.nutrition7.avg.proteinG;
  if (avg >= target * 0.9) return { id: 'protein', level: 'good', text: fmt(R.proteinOk, { avg: num(avg, 0), target }) };
  return { id: 'protein', level: 'warn', text: fmt(R.proteinLow, { avg: num(avg, 0), target, gap: Math.round(target - avg) }) };
}

export function recoveryInsight(ctx: CoachContext): Insight {
  const n = ctx.consecutiveTrainingDays;
  if (n >= 5) return { id: 'recovery', level: 'warn', text: fmt(R.restNeeded, { n }) };
  return { id: 'recovery', level: 'good', text: fmt(R.restOk, { n }) };
}

export function trainingInsight(ctx: CoachContext): Insight {
  const p = ctx.raw.profile;
  const text = fmt(R.trainingWeek, { gym: ctx.workouts7, gymTarget: p.gymDaysPerWeek, runs: ctx.runs7, km: num(ctx.runs7Km), runTarget: p.runDaysPerWeek });
  const planned = p.gymDaysPerWeek + p.runDaysPerWeek;
  const done = ctx.workouts7 + ctx.runs7;
  if (done < planned - 1) return { id: 'training', level: 'warn', text: `${text} ${R.trainingLow}` };
  if (done > planned + 2) return { id: 'training', level: 'info', text: `${text} ${R.trainingHigh}` };
  return { id: 'training', level: 'good', text };
}

/** Incohérences entre l'objectif déclaré et les données réelles. */
export function inconsistencies(ctx: CoachContext): Insight[] {
  const { profile, targets, currentWeightKg } = ctx.raw;
  const out: Insight[] = [];
  const goal = t.options.goal[profile.goal];
  if (profile.targetWeightKg) {
    const b = bmi(profile.targetWeightKg, profile.heightCm);
    if (b < 18.5) out.push({ id: 'bmi', level: 'warn', text: fmt(R.goalBmiLow, { target: num(profile.targetWeightKg), bmi: num(b, 1) }) });
    const wantsDown = profile.goal === 'fat_loss' || profile.goal === 'recomp';
    if (wantsDown && profile.targetWeightKg > currentWeightKg + 1)
      out.push({ id: 'dir', level: 'warn', text: fmt(R.goalTargetDirection, { target: num(profile.targetWeightKg), dir: R.above, w: num(currentWeightKg), goal }) });
    if (profile.goal === 'muscle_gain' && profile.targetWeightKg < currentWeightKg - 1)
      out.push({ id: 'dir', level: 'warn', text: fmt(R.goalTargetDirection, { target: num(profile.targetWeightKg), dir: R.below, w: num(currentWeightKg), goal }) });
  }
  if (ctx.nutrition7.daysLogged >= MIN_LOGGED_DAYS) {
    const avg = ctx.nutrition7.avg.kcal;
    if (profile.goal === 'muscle_gain' && avg < targets.tdee - 100) out.push({ id: 'gain_deficit', level: 'warn', text: fmt(R.goalGainDeficit, { kcal: num(avg, 0), tdee: num(targets.tdee, 0) }) });
    if ((profile.goal === 'fat_loss' || profile.goal === 'recomp') && avg > targets.tdee + 100)
      out.push({ id: 'loss_surplus', level: 'warn', text: fmt(R.goalLossSurplus, { goal, kcal: num(avg, 0), tdee: num(targets.tdee, 0) }) });
  }
  return out;
}

export function conflictInsights(ctx: CoachContext): Insight[] {
  return ctx.conflicts
    .filter((c) => c.type === 'run_after_legs')
    .map((c) => ({ id: `conflict-${c.runDate}`, level: 'warn' as const, text: fmt(R.conflict, { run: formatDateFr(c.runDate, { weekday: 'long', day: 'numeric' }), legs: formatDateFr(c.legsDate, { weekday: 'long' }) }) }));
}

export function todayText(ctx: CoachContext): string {
  const today = ctx.raw.today;
  const planned = ctx.plannedNext7.filter((a) => a.date === today);
  const yesterdayLegs = ctx.raw.workouts.some((w) => w.date === addDays(today, -1) && w.legsHeavy);
  const parts: string[] = [];
  const active = planned.find((a) => a.kind !== 'rest' && a.status !== 'done');
  if (active) parts.push(fmt(R.todayPlanned, { title: active.title }));
  else if (planned.some((a) => a.kind === 'rest')) parts.push(R.todayRest);
  else if (!planned.length) parts.push(R.todayNothing);
  if (yesterdayLegs) parts.push(R.todayAfterLegs);
  if (ctx.consecutiveTrainingDays >= 5) parts.push(fmt(R.restNeeded, { n: ctx.consecutiveTrainingDays }));
  return parts.join(' ');
}

function runText(ctx: CoachContext): string {
  return ctx.runs7 ? fmt(R.runAdvice, { km: num(ctx.runs7Km) }) : R.runNone;
}

function trendText(ctx: CoachContext): string {
  if (!ctx.trend || ctx.trend.changeKg === null) return R.trendNeed;
  return fmt(R.trendLine, { avg: num(ctx.trend.currentAvg), change: signed(ctx.trend.changeKg, 2), pct: signed(ctx.trend.changePct ?? 0, 2) });
}

// --- Course avancée, micronutriments, Ramadan, chaussures -----------------------

export function loadInsights(ctx: CoachContext): Insight[] {
  const load = ctx.raw.extra?.load;
  if (load === undefined) return [];
  if (!load) return [{ id: 'load', level: 'info', text: R.loadNone }];
  const vars = { tsb: signed(load.tsb, 0), ctl: num(load.ctl, 0), atl: num(load.atl, 0) };
  const text = { overload: R.loadOverload, optimal: R.loadOptimal, fresh: R.loadFresh, neutral: R.loadNeutral, transition: R.loadTransition }[load.zone];
  const out: Insight[] = [{ id: 'load', level: load.zone === 'overload' ? 'warn' : load.zone === 'fresh' ? 'good' : 'info', text: fmt(text, vars) }];
  if (load.ramp !== null && load.ramp > 8) out.push({ id: 'ramp', level: 'warn', text: fmt(R.loadRamp, { v: num(load.ramp) }) });
  return out;
}

export function microInsights(ctx: CoachContext): Insight[] {
  const m = ctx.raw.extra?.micros;
  if (!m || !m.days) return [];
  const out: Insight[] = [];
  const st = (k: keyof typeof m.avg) => (m.avg[k] && m.targets[k] ? microStatus(m.avg[k]!, m.targets[k]!) : 'unknown');
  const v = (k: keyof typeof m.avg, d = 0) => num(m.avg[k]?.value ?? 0, d);
  if (st('fiberG') === 'low') out.push({ id: 'fiber', level: 'warn', text: fmt(R.fiberLow, { v: v('fiberG') }) });
  if (st('saltG') === 'high') out.push({ id: 'salt', level: 'warn', text: fmt(R.saltHigh, { v: v('saltG', 1) }) });
  if (st('sugarsG') === 'high') out.push({ id: 'sugar', level: 'info', text: fmt(R.sugarHigh, { v: v('sugarsG') }) });
  if (st('ironMg') === 'low') out.push({ id: 'iron', level: 'info', text: fmt(R.ironLow, { v: v('ironMg', 1), t: m.targets.ironMg!.value }) });
  if (st('calciumMg') === 'low') out.push({ id: 'calcium', level: 'info', text: fmt(R.calciumLow, { v: v('calciumMg'), t: m.targets.calciumMg!.value }) });
  if (!out.length) {
    const known = st('fiberG') !== 'unknown' && st('saltG') !== 'unknown';
    out.push({ id: 'micros', level: known ? 'good' : 'info', text: known ? R.microsOk : R.microsUnknown });
  }
  return out;
}

export function ramadanInsights(ctx: CoachContext): Insight[] {
  const r = ctx.raw.extra?.ramadan;
  if (!r) return [];
  return [
    { id: 'ramadan', level: 'info', text: fmt(R.ramadanLine, { ml: r.waterMl, iftar: r.iftar, suhoor: r.suhoor }) },
    { id: 'ramadan-training', level: 'info', text: R.ramadanTraining },
  ];
}

export function shoeInsights(ctx: CoachContext): Insight[] {
  return (ctx.raw.extra?.shoes ?? [])
    .filter((s) => s.status !== 'ok')
    .map((s) => ({ id: `shoe-${s.name}`, level: s.status === 'replace' ? ('warn' as const) : ('info' as const), text: fmt(s.status === 'replace' ? R.shoeReplace : R.shoeSoon, { name: s.name, km: num(s.km, 0), alert: s.alertKm }) }));
}

function vdotText(ctx: CoachContext): string | null {
  const v = ctx.raw.extra?.vdot;
  return v ? fmt(R.vdotLine, { v: num(v.value), t: formatPace(v.thresholdPace), e: formatPace(v.easyPace) }) : null;
}

/** Insights affichés en tête du coach (analyse de la semaine). */
export function weeklyInsights(ctx: CoachContext): Insight[] {
  const out: Insight[] = [
    { id: 'trend', level: 'info', text: trendText(ctx) },
    { id: 'calories', level: calorieAdvice(ctx).kind === 'keep' ? 'good' : 'info', text: calorieText(ctx) },
    proteinInsight(ctx),
    trainingInsight(ctx),
    recoveryInsight(ctx),
    ...loadInsights(ctx),
    ...shoeInsights(ctx),
    ...conflictInsights(ctx),
    ...inconsistencies(ctx),
    ...microInsights(ctx),
    ...ramadanInsights(ctx),
  ];
  if (ctx.raw.profile.injuries.trim()) out.push({ id: 'injury', level: 'info', text: fmt(R.injuryNote, { injury: ctx.raw.profile.injuries.trim().slice(0, 80) }) });
  return out;
}

export function weeklyReportText(ctx: CoachContext): string {
  return [`${R.weekReportTitle} :`, ...weeklyInsights(ctx).map((i) => `• ${i.text}`), '', runText(ctx)].join('\n');
}

// --- Sécurité -----------------------------------------------------------------

const MEDICAL = ['douleur', 'mal au', 'mal a', 'blesse', 'blessure', 'medicament', 'maladie', 'diabete', 'tension', 'cardiaque', 'coeur', 'vertige', 'malaise', 'enceinte', 'grossesse', 'traitement', 'symptome', 'fievre', 'antibiotique', 'insuline', 'diagnostic', 'anorexie', 'boulimie'];

export function isMedical(message: string): boolean {
  const m = ` ${normalizeText(message)} `;
  return MEDICAL.some((k) => m.includes(k));
}

/** Détecte une demande de régime sous le BMR (ex. « 1000 kcal », « jeûne de 3 jours »). */
export function asksTooFewCalories(message: string, bmr: number): boolean {
  const m = normalizeText(message);
  if (/jeun(e|er)? (de )?\d+ jours|ne plus manger|arreter de manger|sauter tous les repas/.test(m)) return true;
  const match = m.match(/(\d{3,4})\s*(k?cal|calories)/);
  return !!match && Number(match[1]) < bmr && /(manger|regime|objectif|descendre|passer a|seulement|que)/.test(m);
}

// --- Réponse au message --------------------------------------------------------

export interface ExerciseInfo {
  name: string;
  muscles: string[];
  instructions: string;
  mistakes: string;
}

type Intent = 'calories' | 'protein' | 'micros' | 'ramadan' | 'shoes' | 'load' | 'rest' | 'today' | 'run' | 'week' | 'greeting' | 'unknown';

const INTENTS: [Intent, RegExp][] = [
  ['calories', /calori|kcal|manger plus|manger moins|deficit|surplus|ajust/],
  ['protein', /prot(e|é)in|proteine/],
  ['ramadan', /ramadan|ftour|f'tour|shour|s'hour|suhoor|iftar|jeune/],
  ['micros', /fibre|sel\b|sodium|sucre|fer\b|calcium|vitamine|micronutri|potassium/],
  ['shoes', /chaussure|basket|running shoe/],
  ['load', /charge|forme\b|fraicheur|tsb|ctl|atl|vdot|surcharge/],
  ['rest', /repos|recup|fatigu|surentrain|courbatur/],
  ['today', /aujourd|ce soir|ce matin|que faire|quoi faire|seance du jour|prochaine seance/],
  ['run', /course|courir|footing|running|allure|km\b|10 ?k|5 ?k/],
  ['week', /semaine|bilan|analyse|rapport|progres|resume/],
  ['greeting', /^(salut|bonjour|bonsoir|hello|salam|slt|cc)\b/],
];

export function detectIntent(message: string): Intent {
  const m = normalizeText(message);
  for (const [intent, re] of INTENTS) if (re.test(m)) return intent;
  return 'unknown';
}

export function findExercise(message: string, exercises: ExerciseInfo[]): ExerciseInfo | undefined {
  const m = normalizeText(message);
  // Le nom le plus long d'abord (« squat bulgare » avant « squat »).
  return [...exercises].sort((a, b) => b.name.length - a.name.length).find((e) => m.includes(normalizeText(e.name)));
}

/** Réponse du moteur de règles à un message. Toujours basée sur les données réelles. */
export function rulesReply(message: string, ctx: CoachContext, exercises: ExerciseInfo[] = []): string {
  if (isMedical(message)) return `${R.medical}\n\n${t.coach.disclaimer}`;
  if (asksTooFewCalories(message, ctx.raw.targets.bmr)) return fmt(R.lowCalories, { bmr: ctx.raw.targets.bmr, kcal: num(ctx.raw.targets.calories, 0) });

  // Question sur un aliment cité (« wach nakol dattes ? », « combien de khobz ? »).
  const food = ctx.raw.extra?.food;
  if (food && (FOOD_QUESTION.test(normalizeText(message)) || FOOD_QUESTION.test(message))) {
    return foodAdvice(food, ctx.raw.targets, ctx.raw.profile.goal, { ramadan: !!ctx.raw.extra?.ramadan });
  }

  const ex = findExercise(message, exercises);
  if (ex) {
    return fmt(R.exercise, {
      name: ex.name,
      muscles: ex.muscles.map((m) => t.exercise.muscles[m] ?? m).join(', '),
      how: ex.instructions || '—',
      mistakes: ex.mistakes || '—',
    });
  }

  switch (detectIntent(message)) {
    case 'calories':
      return [trendText(ctx), calorieText(ctx)].join('\n');
    case 'protein':
      return proteinInsight(ctx).text;
    case 'micros':
      return microInsights(ctx).map((i) => i.text).join('\n') || R.microsUnknown;
    case 'ramadan':
      return ramadanInsights(ctx).map((i) => i.text).join('\n') || R.ramadanTraining;
    case 'shoes':
      return shoeInsights(ctx).map((i) => i.text).join('\n') || t.runx.noShoes;
    case 'load':
      return [...loadInsights(ctx).map((i) => i.text), vdotText(ctx)].filter(Boolean).join('\n') || R.loadNone;
    case 'rest':
      return [recoveryInsight(ctx).text, ...loadInsights(ctx).map((i) => i.text), ...conflictInsights(ctx).map((i) => i.text)].join('\n');
    case 'today':
      return todayText(ctx);
    case 'run':
      return [runText(ctx), vdotText(ctx), ...loadInsights(ctx).map((i) => i.text), ...shoeInsights(ctx).map((i) => i.text), ...conflictInsights(ctx).map((i) => i.text)].filter(Boolean).join('\n');
    case 'greeting':
      return `${fmt(R.greeting, { name: ctx.raw.profile.name })}\n\n${weeklyReportText(ctx)}`;
    case 'week':
      return weeklyReportText(ctx);
    default:
      return `${R.unknown}\n\n${weeklyReportText(ctx)}`;
  }
}
