// Musculation : 1RM estimé, volume, records, suggestions de surcharge progressive.

export interface SetLike {
  reps: number;
  weightKg: number;
  rpe?: number;
  done: boolean;
}

/** 1RM estimé (Epley) : poids × (1 + reps / 30). Au-delà de 12 reps l'estimation devient peu fiable. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function volume(sets: SetLike[]): number {
  return sets.filter((s) => s.done).reduce((sum, s) => sum + s.reps * s.weightKg, 0);
}

export interface ExerciseRecords {
  bestWeightKg: number;
  bestWeightReps: number;
  best1RM: number;
  bestVolumeSet: number;
}

export function exerciseRecords(sets: SetLike[]): ExerciseRecords | null {
  const done = sets.filter((s) => s.done && s.reps > 0);
  if (!done.length) return null;
  let bestWeightKg = 0;
  let bestWeightReps = 0;
  let best1RM = 0;
  let bestVolumeSet = 0;
  for (const s of done) {
    if (s.weightKg > bestWeightKg || (s.weightKg === bestWeightKg && s.reps > bestWeightReps)) {
      bestWeightKg = s.weightKg;
      bestWeightReps = s.reps;
    }
    best1RM = Math.max(best1RM, epley1RM(s.weightKg, Math.min(s.reps, 12)));
    bestVolumeSet = Math.max(bestVolumeSet, s.weightKg * s.reps);
  }
  return { bestWeightKg, bestWeightReps, best1RM, bestVolumeSet };
}

/** Pas de charge selon l'équipement (haltères : paires de 2 kg ; jambes : 5 kg). */
export function weightIncrement(equipment: string, category: string): number {
  if (equipment === 'bodyweight') return 0;
  if (equipment === 'dumbbell' || equipment === 'kettlebell') return 2;
  if (category === 'legs' || category === 'glutes') return 5;
  return 2.5;
}

export type Suggestion =
  | { kind: 'increase'; weightKg: number; reps: number }
  | { kind: 'reps'; weightKg: number; reps: number }
  | { kind: 'keep'; weightKg: number; reps: number }
  | { kind: 'deload'; weightKg: number; reps: number }
  | { kind: 'first' };

/**
 * Surcharge progressive simple, à partir des séries de la dernière séance :
 * - toutes les reps visées réussies à un RPE ≤ cible → on ajoute du poids ;
 * - reps réussies mais RPE trop haut → même poids, on consolide ;
 * - il manque 1–2 reps → même poids, on vise +1 rep ;
 * - échec net (≥ 3 reps manquées en moyenne) → baisse de ~10 %.
 */
export function suggestNext(
  lastSets: SetLike[],
  target: { reps: number; rpe?: number },
  increment: number,
): Suggestion {
  const work = lastSets.filter((s) => s.done && s.reps > 0);
  if (!work.length) return { kind: 'first' };
  const weight = Math.max(...work.map((s) => s.weightKg));
  const top = work.filter((s) => s.weightKg === weight);
  const allHit = top.every((s) => s.reps >= target.reps);
  const rpes = top.map((s) => s.rpe).filter((r): r is number => r !== undefined);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined;
  const targetRpe = target.rpe ?? 8;
  const avgMissing = top.reduce((sum, s) => sum + Math.max(0, target.reps - s.reps), 0) / top.length;

  if (allHit && (avgRpe === undefined || avgRpe <= targetRpe)) {
    if (increment === 0) return { kind: 'reps', weightKg: weight, reps: target.reps + 1 };
    return { kind: 'increase', weightKg: weight + increment, reps: target.reps };
  }
  if (allHit) return { kind: 'keep', weightKg: weight, reps: target.reps };
  if (avgMissing >= 3) {
    const step = increment || 1;
    const reduced = Math.max(0, Math.round((weight * 0.9) / step) * step);
    return { kind: 'deload', weightKg: reduced, reps: target.reps };
  }
  return { kind: 'reps', weightKg: weight, reps: target.reps };
}
