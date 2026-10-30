import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '@/db/db';
import type { BodyMeasurement, Profile, Settings } from '@/db/types';
import { computeTargets, type Targets } from '@/lib/energy';

/** undefined = chargement, null = pas encore de profil. */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => (await db.profile.get('me')) ?? null);
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => ({ ...DEFAULT_SETTINGS, ...(await db.settings.get('app')) }));
}

/** Mesures contenant un poids, triées par date croissante. */
export function useWeightEntries(): BodyMeasurement[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.bodyMeasurements.orderBy('date').toArray();
    return rows.filter((r) => typeof r.weightKg === 'number');
  });
}

export function latestWeight(profile: Profile, entries: BodyMeasurement[] | undefined): number {
  if (!entries?.length) return profile.weightKg;
  const last = entries.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.createdAt > a.createdAt) ? b : a));
  return last.weightKg ?? profile.weightKg;
}

export function targetsFor(profile: Profile, weightKg: number): Targets {
  return computeTargets({
    weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    gender: profile.gender,
    activity: profile.activityLevel,
    goal: profile.goal,
  });
}

export function useTargets(profile: Profile | null | undefined, entries: BodyMeasurement[] | undefined) {
  return useMemo(() => {
    if (!profile) return undefined;
    const weight = latestWeight(profile, entries);
    return { weight, targets: targetsFor(profile, weight) };
  }, [profile, entries]);
}
