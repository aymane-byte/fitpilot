// Résumé du jour : ce qui est fait, ce qui reste, et la prochaine action recommandée.
// Chaque phase ajoutera ses éléments (repas…) ici.

export type TodayKey = 'weigh' | 'water' | 'backup' | 'activity' | 'meals';

export interface TodayItem {
  key: TodayKey;
  done: boolean;
  /** Plus petit = plus prioritaire pour la recommandation. */
  priority: number;
}

export interface TodayInput {
  weighedToday: boolean;
  waterMl: number;
  waterTargetMl: number;
  backupDue: boolean;
  hour: number;
  /** Séance ou course prévue aujourd'hui (le repos n'est pas une tâche). */
  planned?: { done: boolean };
  /** Au moins un aliment noté aujourd'hui. */
  mealsLogged?: boolean;
}

export function todayItems(input: TodayInput): TodayItem[] {
  const items: TodayItem[] = [
    // La pesée est prioritaire le matin, moins pertinente le soir.
    { key: 'weigh', done: input.weighedToday, priority: input.hour < 12 ? 0 : 4 },
  ];
  if (input.planned) items.push({ key: 'activity', done: input.planned.done, priority: 1 });
  if (input.mealsLogged !== undefined) items.push({ key: 'meals', done: input.mealsLogged, priority: input.hour >= 13 ? 1.5 : 2.5 });
  items.push({ key: 'water', done: input.waterMl >= input.waterTargetMl, priority: 2 });
  if (input.backupDue) items.push({ key: 'backup', done: false, priority: 3 });
  return items;
}

export function nextAction(items: TodayItem[]): TodayItem | null {
  const todo = items.filter((i) => !i.done).sort((a, b) => a.priority - b.priority);
  return todo[0] ?? null;
}
