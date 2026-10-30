import { db } from '@/db/db';
import type { Profile } from '@/db/types';
import { todayISO } from '@/lib/dates';
import { fieldErrors, profileSchema } from '@/lib/schemas';

export type SaveResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Valide et enregistre le profil. Si le poids saisi diffère de la dernière pesée,
 * il est aussi ajouté comme pesée du jour (le poids courant vient des pesées).
 */
export async function saveProfile(draft: Profile, lastWeightKg?: number): Promise<SaveResult> {
  const parsed = profileSchema.safeParse({ ...draft, updatedAt: Date.now() });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const profile = parsed.data;
  await db.transaction('rw', db.profile, db.bodyMeasurements, async () => {
    await db.profile.put(profile);
    if (lastWeightKg === undefined || Math.abs(lastWeightKg - profile.weightKg) > 0.001) {
      await db.bodyMeasurements.add({ date: todayISO(), weightKg: profile.weightKg, createdAt: Date.now() });
    }
  });
  return { ok: true };
}
