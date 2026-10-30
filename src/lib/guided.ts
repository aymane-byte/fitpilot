// Séances guidées : fractionné, tempo, allure cible.
// Une séance = des blocs répétés d'étapes (au temps ou à la distance), avec une allure cible optionnelle.
// Le moteur est une fonction pure : on lui donne le temps actif et la distance, il renvoie l'étape en cours
// et les événements à annoncer. Testé sans GPS.
import { spokenDistance, spokenDuration, spokenPace } from './voice';
import type { TrainingPaces } from './vdot';

export type StepKind = 'warmup' | 'work' | 'recovery' | 'cooldown';

export interface WorkoutStep {
  kind: StepKind;
  /** Durée (s) ou distance (m). */
  by: 'time' | 'distance';
  value: number;
  /** Allure cible (s/km) et tolérance (± s/km). */
  pace?: number;
  tolerance?: number;
}

export interface WorkoutBlock {
  repeat: number;
  steps: WorkoutStep[];
}

export interface GuidedWorkoutDef {
  key: string;
  name: string;
  description: string;
  runType: 'intervals' | 'tempo' | 'easy' | 'long' | 'recovery';
  blocks: WorkoutBlock[];
}

export interface FlatStep extends WorkoutStep {
  /** Répétition (1…n) et total, pour les étapes de travail répétées. */
  rep?: number;
  reps?: number;
}

export function expandWorkout(w: Pick<GuidedWorkoutDef, 'blocks'>): FlatStep[] {
  const out: FlatStep[] = [];
  for (const b of w.blocks) {
    const n = Math.max(1, Math.round(b.repeat));
    for (let i = 0; i < n; i++) {
      for (const s of b.steps) out.push(n > 1 ? { ...s, rep: i + 1, reps: n } : { ...s });
    }
  }
  // Dernière récupération inutile avant le retour au calme.
  const last = out.at(-1);
  if (last?.kind === 'recovery' && last.rep && last.rep === last.reps) out.pop();
  else {
    const iCool = out.findIndex((s) => s.kind === 'cooldown');
    if (iCool > 0 && out[iCool - 1].kind === 'recovery' && out[iCool - 1].rep === out[iCool - 1].reps) out.splice(iCool - 1, 1);
  }
  return out;
}

export interface EngineState {
  index: number;
  /** Temps actif (s) et distance (m) au début de l'étape en cours. */
  startSec: number;
  startM: number;
  done: boolean;
}

export const initialEngine = (): EngineState => ({ index: 0, startSec: 0, startM: 0, done: false });

export interface StepStatus {
  step: FlatStep | null;
  /** Restant dans l'étape : secondes ou mètres selon le type d'étape. */
  remaining: number;
  /** Progression 0–1 dans l'étape. */
  progress: number;
}

/** Fait avancer le moteur ; renvoie le nouvel état et les indices des étapes nouvellement commencées. */
export function advance(steps: FlatStep[], state: EngineState, elapsedSec: number, distanceM: number): { state: EngineState; started: number[]; finished: boolean } {
  let s = { ...state };
  const started: number[] = [];
  let finished = false;
  while (!s.done) {
    const step = steps[s.index];
    if (!step) {
      s.done = true;
      finished = true;
      break;
    }
    const doneAmount = step.by === 'time' ? elapsedSec - s.startSec : distanceM - s.startM;
    if (doneAmount < step.value) break;
    // Fin de l'étape : la suivante démarre exactement là où celle-ci s'est terminée
    // (temps exact pour une étape au temps, distance exacte pour une étape à la distance).
    s = step.by === 'time'
      ? { index: s.index + 1, startSec: s.startSec + step.value, startM: distanceM, done: false }
      : { index: s.index + 1, startSec: elapsedSec, startM: s.startM + step.value, done: false };
    if (s.index >= steps.length) {
      s.done = true;
      finished = true;
    } else started.push(s.index);
  }
  return { state: s, started, finished };
}

export function stepStatus(steps: FlatStep[], state: EngineState, elapsedSec: number, distanceM: number): StepStatus {
  const step = state.done ? null : steps[state.index] ?? null;
  if (!step) return { step: null, remaining: 0, progress: 1 };
  const doneAmount = step.by === 'time' ? elapsedSec - state.startSec : distanceM - state.startM;
  return { step, remaining: Math.max(0, step.value - doneAmount), progress: Math.min(1, doneAmount / step.value) };
}

export type PaceFeedback = 'fast' | 'slow' | 'ok';

/** Compare l'allure actuelle à la cible (allure en s/km : plus petit = plus rapide). */
export function paceFeedback(currentPace: number, target: number, tolerance = 8): PaceFeedback | null {
  if (!currentPace || !Number.isFinite(currentPace)) return null;
  if (currentPace < target - tolerance) return 'fast';
  if (currentPace > target + tolerance) return 'slow';
  return 'ok';
}

/**
 * Faut-il annoncer un écart d'allure ? Pas pendant les 20 premières secondes de l'étape
 * (le temps de prendre l'allure), puis au plus toutes les 30 s tant que l'écart persiste.
 */
export function shouldAlertPace(fb: PaceFeedback | null, secInStep: number, lastAlertSec: number | null, nowSec: number): boolean {
  if (!fb || fb === 'ok' || secInStep < 20) return false;
  return lastAlertSec === null || nowSec - lastAlertSec >= 30;
}

const KIND_FR: Record<StepKind, string> = { warmup: 'Échauffement', work: 'Effort', recovery: 'Récupération', cooldown: 'Retour au calme' };

export function stepLabel(s: FlatStep): string {
  const base = s.kind === 'work' && s.rep ? `Répétition ${s.rep} sur ${s.reps}` : KIND_FR[s.kind];
  return base;
}

export function stepAmount(s: Pick<WorkoutStep, 'by' | 'value'>): string {
  return s.by === 'time' ? spokenDuration(s.value) : spokenDistance(s.value);
}

/** Phrase lue au début d'une étape. */
export function stepAnnouncement(s: FlatStep): string {
  const pace = s.pace ? ` à ${spokenPace(s.pace)}` : '';
  if (s.kind === 'work') return `${stepLabel(s)} : ${stepAmount(s)}${pace}. Go !`;
  return `${stepLabel(s)} : ${stepAmount(s)}${pace}.`;
}

export const paceAlertText = (fb: PaceFeedback) => (fb === 'fast' ? 'Trop rapide, ralentis.' : 'Trop lent, accélère.');

/** Durée (s) et distance (m) totales approximatives (pour les étapes au temps, estimées à l'allure cible ou 6:00/km). */
export function workoutTotals(steps: FlatStep[]): { sec: number; meters: number } {
  let sec = 0;
  let meters = 0;
  for (const s of steps) {
    const pace = s.pace ?? 360;
    if (s.by === 'time') {
      sec += s.value;
      meters += (s.value / pace) * 1000;
    } else {
      meters += s.value;
      sec += (s.value / 1000) * pace;
    }
  }
  return { sec: Math.round(sec), meters: Math.round(meters) };
}

/**
 * Séances fournies. Les allures cibles viennent du VDOT si disponible ; sinon les étapes
 * n'ont pas d'allure cible (guidage au temps / à la distance seulement).
 */
export function builtinWorkouts(paces?: TrainingPaces | null): GuidedWorkoutDef[] {
  const easy = paces ? Math.round((paces.easy[0] + paces.easy[1]) / 2) : undefined;
  const p = (v?: number, tol = 8) => (v ? { pace: v, tolerance: tol } : {});
  const wu: WorkoutStep = { kind: 'warmup', by: 'time', value: 600, ...p(easy, 25) };
  const cd: WorkoutStep = { kind: 'cooldown', by: 'time', value: 600, ...p(easy, 25) };
  return [
    {
      key: 'int-8x400',
      name: 'Fractionné 8 × 400 m',
      description: '10 min d’échauffement, 8 × 400 m vite (récup 1 min 30), 10 min de retour au calme.',
      runType: 'intervals',
      blocks: [{ repeat: 1, steps: [wu] }, { repeat: 8, steps: [{ kind: 'work', by: 'distance', value: 400, ...p(paces?.interval) }, { kind: 'recovery', by: 'time', value: 90 }] }, { repeat: 1, steps: [cd] }],
    },
    {
      key: 'int-5x1000',
      name: 'Fractionné 5 × 1 000 m',
      description: '10 min d’échauffement, 5 × 1 km à allure VMA (récup 2 min), 10 min de retour au calme.',
      runType: 'intervals',
      blocks: [{ repeat: 1, steps: [wu] }, { repeat: 5, steps: [{ kind: 'work', by: 'distance', value: 1000, ...p(paces?.interval) }, { kind: 'recovery', by: 'time', value: 120 }] }, { repeat: 1, steps: [cd] }],
    },
    {
      key: 'int-10x1min',
      name: 'Fractionné 10 × 1 min',
      description: '10 min d’échauffement, 10 × 1 min rapide / 1 min lente, 10 min de retour au calme. Idéal pour débuter.',
      runType: 'intervals',
      blocks: [{ repeat: 1, steps: [wu] }, { repeat: 10, steps: [{ kind: 'work', by: 'time', value: 60, ...p(paces?.interval, 12) }, { kind: 'recovery', by: 'time', value: 60 }] }, { repeat: 1, steps: [cd] }],
    },
    {
      key: 'tempo-20',
      name: 'Tempo 20 min',
      description: '10 min d’échauffement, 20 min à allure seuil (« confortablement difficile »), 10 min de retour au calme.',
      runType: 'tempo',
      blocks: [{ repeat: 1, steps: [wu, { kind: 'work', by: 'time', value: 1200, ...p(paces?.threshold) }, cd] }],
    },
    {
      key: 'tempo-2x10',
      name: 'Tempo 2 × 10 min',
      description: '10 min d’échauffement, 2 × 10 min à allure seuil (récup 2 min), 10 min de retour au calme.',
      runType: 'tempo',
      blocks: [{ repeat: 1, steps: [wu] }, { repeat: 2, steps: [{ kind: 'work', by: 'time', value: 600, ...p(paces?.threshold) }, { kind: 'recovery', by: 'time', value: 120 }] }, { repeat: 1, steps: [cd] }],
    },
  ];
}

/** Séance « allure cible » : une distance à tenir à une allure donnée. */
export function targetPaceWorkout(distanceM: number, pace: number, tolerance = 8): GuidedWorkoutDef {
  return {
    key: `target-${distanceM}-${pace}`,
    name: `Allure cible ${spokenDistance(distanceM)}`,
    description: `Tenir ${spokenPace(pace)} sur ${spokenDistance(distanceM)}.`,
    runType: 'tempo',
    blocks: [{ repeat: 1, steps: [{ kind: 'work', by: 'distance', value: distanceM, pace, tolerance }] }],
  };
}

/** Séance perso à partir du formulaire simple (échauffement, répétitions, récup, retour au calme). */
export function customWorkout(input: {
  name: string;
  warmupMin: number;
  reps: number;
  workBy: 'time' | 'distance';
  workValue: number;
  recoverySec: number;
  cooldownMin: number;
  pace?: number;
  tolerance?: number;
}): GuidedWorkoutDef {
  const blocks: WorkoutBlock[] = [];
  if (input.warmupMin > 0) blocks.push({ repeat: 1, steps: [{ kind: 'warmup', by: 'time', value: Math.round(input.warmupMin * 60) }] });
  const work: WorkoutStep = { kind: 'work', by: input.workBy, value: input.workValue, ...(input.pace ? { pace: input.pace, tolerance: input.tolerance ?? 8 } : {}) };
  blocks.push({ repeat: Math.max(1, input.reps), steps: input.recoverySec > 0 && input.reps > 1 ? [work, { kind: 'recovery', by: 'time', value: input.recoverySec }] : [work] });
  if (input.cooldownMin > 0) blocks.push({ repeat: 1, steps: [{ kind: 'cooldown', by: 'time', value: Math.round(input.cooldownMin * 60) }] });
  return { key: 'custom', name: input.name, description: '', runType: input.reps > 1 ? 'intervals' : 'tempo', blocks };
}
