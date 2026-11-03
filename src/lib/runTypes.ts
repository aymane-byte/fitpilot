// Types d'activité : course (footing, tempo…), marche, randonnée, vélo.
export const RUN_TYPES = ['easy', 'tempo', 'intervals', 'long', 'recovery', 'walk', 'hike', 'bike'] as const;
export type RunTypeKey = (typeof RUN_TYPES)[number];

/** Types qui sont de la course à pied (records, VDOT, allures, séances guidées). */
export const RUNNING_TYPES = new Set<string>(['easy', 'tempo', 'intervals', 'long', 'recovery']);
export const isRunning = (type: string | undefined) => RUNNING_TYPES.has(type ?? 'easy');

/** Vitesse maximale crédible (m/s) pour filtrer les sauts GPS : 30 km/h à pied, 90 km/h à vélo. */
export function maxSpeedFor(type: string | undefined): number {
  return type === 'bike' ? 25 : 8.5;
}

/** Allure minimale crédible (s/km) : 2:30 /km à pied, 40 s/km (90 km/h) à vélo. */
export function minPaceFor(type: string | undefined): number {
  return type === 'bike' ? 40 : 150;
}

/** Dépense ≈ kcal par kg et par km (estimations classiques) : course 1, marche 0,55, rando 0,8, vélo 0,3. */
export const KCAL_PER_KG_KM: Record<string, number> = { walk: 0.55, hike: 0.8, bike: 0.3 };

/** Type d'activité déduit d'un fichier importé (GPX « type », FIT « sport »). null = non pris en charge. */
export function typeFromActivity(activity: string | undefined): RunTypeKey | null {
  if (!activity) return 'easy';
  const a = activity.toLowerCase();
  if (/swim|natation|ski|drive|motor|boat|paddl|kayak|row/.test(a)) return null;
  if (/cycl|bik|ride|vélo|velo/.test(a)) return 'bike';
  if (/hik|rando|trek|mountaineer/.test(a)) return 'hike';
  if (/walk|marche/.test(a)) return 'walk';
  return 'easy';
}
