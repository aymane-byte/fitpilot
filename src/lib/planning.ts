// Planning hebdomadaire : génération automatique et détection des conflits de récupération.
import { addDays, type ISODate } from './dates';

export type ActivityKind = 'workout' | 'run' | 'rest';

export interface PlanActivity {
  date: ISODate;
  kind: ActivityKind;
  title: string;
  status?: 'planned' | 'done' | 'skipped';
  programId?: number;
  legsHeavy?: boolean;
  runType?: string;
}

export interface WorkoutTemplate {
  programId?: number;
  title: string;
  legsHeavy: boolean;
}

/** Jours d'entraînement muscu (0 = lundi) selon le nombre de séances, espacés au mieux. */
const GYM_LAYOUT: Record<number, number[]> = {
  0: [],
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export interface GenerateInput {
  weekStart: ISODate; // lundi
  gymDays: number;
  runDays: number;
  workouts: WorkoutTemplate[]; // séances du programme, dans l'ordre
  runTitles?: string[]; // ex. séances du plan de course de la semaine
  /** Jours de récupération après jambes lourdes avant une course (1 = 24 h, 2 = 48 h). */
  recoveryDays?: number;
}

/**
 * Génère une semaine : muscu d'abord (espacée), puis course sur les jours libres
 * qui ne suivent PAS une séance de jambes lourde. Les jours restants sont du repos.
 */
export function generateWeek(input: GenerateInput): PlanActivity[] {
  const gym = Math.min(7, Math.max(0, input.gymDays));
  const runs = Math.min(7, Math.max(0, input.runDays));
  const gymIdx = GYM_LAYOUT[gym];
  const byDay = new Map<number, PlanActivity[]>();
  const push = (day: number, a: Omit<PlanActivity, 'date'>) => {
    const list = byDay.get(day) ?? [];
    list.push({ ...a, date: addDays(input.weekStart, day), status: 'planned' });
    byDay.set(day, list);
  };

  const legsDays = new Set<number>();
  gymIdx.forEach((day, i) => {
    const w = input.workouts.length ? input.workouts[i % input.workouts.length] : { title: 'Musculation', legsHeavy: false };
    push(day, { kind: 'workout', title: w.title, programId: w.programId, legsHeavy: w.legsHeavy });
    if (w.legsHeavy) legsDays.add(day);
  });

  // Score des jours candidats pour la course : libres, pas le lendemain de jambes, pas jambes le même jour.
  const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !gymIdx.includes(d));
  const rec = Math.max(1, input.recoveryDays ?? 1);
  // Jour sûr : pas de jambes lourdes ce jour-là ni dans les `rec` jours précédents.
  const safe = (d: number) => !legsDays.has(d) && Array.from({ length: rec }, (_, k) => (d - k - 1 + 7) % 7).every((x) => !legsDays.has(x));
  const preferred = [...free.filter(safe), ...[0, 1, 2, 3, 4, 5, 6].filter((d) => gymIdx.includes(d) && safe(d))];
  const runDaysChosen: number[] = [];
  // Espacer les courses : on prend en priorité des jours non consécutifs.
  for (const d of preferred) {
    if (runDaysChosen.length >= runs) break;
    if (runDaysChosen.some((x) => Math.abs(x - d) === 1)) continue;
    runDaysChosen.push(d);
  }
  for (const d of preferred) {
    if (runDaysChosen.length >= runs) break;
    if (!runDaysChosen.includes(d)) runDaysChosen.push(d);
  }
  // En dernier recours (beaucoup de séances), on accepte un jour non idéal : il sera signalé.
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (runDaysChosen.length >= runs) break;
    if (!runDaysChosen.includes(d)) runDaysChosen.push(d);
  }
  runDaysChosen.sort((a, b) => a - b);
  runDaysChosen.forEach((d, i) => {
    // La dernière course de la semaine est la sortie longue.
    const isLong = runs >= 2 && i === runDaysChosen.length - 1;
    push(d, { kind: 'run', title: input.runTitles?.[i] ?? (isLong ? 'Sortie longue' : 'Footing facile'), runType: isLong ? 'long' : 'easy' });
  });

  for (let d = 0; d < 7; d++) if (!byDay.has(d)) push(d, { kind: 'rest', title: 'Repos' });
  return [...byDay.entries()].sort(([a], [b]) => a - b).flatMap(([, list]) => list);
}

export interface Conflict {
  type: 'run_after_legs' | 'run_same_day_legs';
  runDate: ISODate;
  legsDate: ISODate;
}

/** Signale les courses prévues le jour même ou dans les `recoveryDays` jours après une séance de jambes lourde. */
export function findConflicts(activities: PlanActivity[], recoveryDays = 1): Conflict[] {
  const active = activities.filter((a) => a.status !== 'skipped');
  const legs = active.filter((a) => a.kind === 'workout' && a.legsHeavy);
  const out: Conflict[] = [];
  for (const run of active.filter((a) => a.kind === 'run')) {
    for (const l of legs) {
      const gap = Math.round((Date.parse(run.date) - Date.parse(l.date)) / 86_400_000);
      if (gap >= 1 && gap <= recoveryDays) out.push({ type: 'run_after_legs', runDate: run.date, legsDate: l.date });
      else if (l.date === run.date) out.push({ type: 'run_same_day_legs', runDate: run.date, legsDate: l.date });
    }
  }
  return out;
}

/** Conflits qu'ajouterait une nouvelle activité (pour avertir avant d'enregistrer). */
export function conflictsIfAdded(existing: PlanActivity[], added: PlanActivity, recoveryDays = 1): Conflict[] {
  const before = new Set(findConflicts(existing, recoveryDays).map((c) => JSON.stringify(c)));
  return findConflicts([...existing, added], recoveryDays).filter((c) => !before.has(JSON.stringify(c)));
}
