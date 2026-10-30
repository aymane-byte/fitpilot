import type { Profile } from '@/db/types';

/**
 * Valeurs pré-remplies de l'onboarding (modifiables). Elles ne sont utilisées
 * qu'ici : aucun calcul ne dépend de ces valeurs en dur.
 */
export function defaultProfileDraft(now = Date.now()): Profile {
  return {
    id: 'me',
    name: '',
    age: 20,
    gender: 'male',
    heightCm: 170,
    weightKg: 78,
    targetWeightKg: undefined,
    goal: 'recomp',
    injuries: '',
    gymLevel: 'intermediate',
    gymDaysPerWeek: 3,
    equipment: 'gym',
    runLevel: 'intermediate',
    runDaysPerWeek: 2,
    canRunMinutes: 30,
    preferredTime: 'evening',
    activityLevel: 'moderate',
    dietaryPreferences: 'Repas familiaux marocains, flexibles',
    allergies: '',
    foodBudget: 'medium',
    supplements: 'Créatine monohydrate',
    createdAt: now,
    updatedAt: now,
  };
}
