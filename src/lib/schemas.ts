// Schémas de validation (zod) pour les saisies utilisateur et l'import de sauvegarde.
import { z } from 'zod';
import { isValidISODate } from './dates';
import { t } from '@/i18n';

export const isoDate = z.string().refine(isValidISODate, t.errors.date);

export const goalSchema = z.enum(['fat_loss', 'recomp', 'muscle_gain', 'maintenance', 'endurance']);
export const activitySchema = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export const levelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const profileSchema = z.object({
  id: z.literal('me'),
  name: z.string().trim().min(1, t.errors.name).max(40),
  age: z.number().int().min(14, t.errors.ageMin).max(100, t.errors.ageMax),
  gender: z.enum(['male', 'female']),
  heightCm: z.number().min(120, t.errors.heightRange).max(230, t.errors.heightRange),
  weightKg: z.number().min(30, t.errors.weightRange).max(300, t.errors.weightRange),
  targetWeightKg: z.number().min(30, t.errors.weightRange).max(300, t.errors.weightRange).optional(),
  goal: goalSchema,
  injuries: z.string().max(500),
  gymLevel: levelSchema,
  gymDaysPerWeek: z.number().int().min(0).max(7),
  equipment: z.enum(['gym', 'home', 'both']),
  runLevel: z.enum(['none', 'beginner', 'intermediate', 'advanced']),
  runDaysPerWeek: z.number().int().min(0).max(7),
  canRunMinutes: z.number().int().min(0).max(600),
  preferredTime: z.enum(['morning', 'midday', 'evening']),
  activityLevel: activitySchema,
  dietaryPreferences: z.string().max(300),
  allergies: z.string().max(300),
  foodBudget: z.enum(['low', 'medium', 'high']),
  supplements: z.string().max(300),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Profile = z.infer<typeof profileSchema>;

export const weightEntrySchema = z.object({
  date: isoDate,
  weightKg: z.number().min(30, t.errors.weightRange).max(300, t.errors.weightRange),
});

// Sans dépendance à zod (utilisé par les champs de saisie dès le premier écran).
export { parseDecimal } from './decimal';

/** Premier message d'erreur par champ, pour affichage sous les inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
