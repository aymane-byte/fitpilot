// Résolution d'une séance guidée à partir de sa clé (séances fournies, perso, allure cible).
import type { RunWorkout } from '@/db/types';
import { builtinWorkouts, targetPaceWorkout, type GuidedWorkoutDef } from '@/lib/guided';
import type { TrainingPaces } from '@/lib/vdot';

export const customKey = (id: number) => `perso-${id}`;
export const targetKey = (meters: number, pace: number, tol = 8) => `cible-${meters}-${pace}-${tol}`;

export function customToDef(w: RunWorkout): GuidedWorkoutDef {
  return { key: customKey(w.id!), name: w.name, description: '', runType: w.runType as GuidedWorkoutDef['runType'], blocks: w.blocks };
}

export function resolveWorkout(key: string | null | undefined, paces: TrainingPaces | null, customs: RunWorkout[]): GuidedWorkoutDef | null {
  if (!key) return null;
  const target = /^cible-(\d+)-(\d+)-(\d+)$/.exec(key);
  if (target) {
    const def = targetPaceWorkout(Number(target[1]), Number(target[2]), Number(target[3]));
    return { ...def, key };
  }
  const custom = /^perso-(\d+)$/.exec(key);
  if (custom) {
    const w = customs.find((c) => c.id === Number(custom[1]));
    return w ? customToDef(w) : null;
  }
  return builtinWorkouts(paces).find((w) => w.key === key) ?? null;
}
