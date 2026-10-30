import type { MealType, Settings } from '@/db/types';
import { t } from '@/i18n';

/** Nom du repas ; en mode Ramadan : s'hour, ftour… */
export function mealLabel(meal: MealType, settings?: Pick<Settings, 'ramadan'>): string {
  return settings?.ramadan?.enabled ? t.nx.ramadanMeals[meal] : t.nutrition.meals[meal];
}
