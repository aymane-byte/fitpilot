// Nutrition : nutriments d'une portion, totaux, recettes, rapport hebdo, allergènes.
import { addDays, type ISODate } from './dates';
import { normalizeText } from './text';

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Per100g extends Nutrients {}

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nutriments pour `grams` grammes d'un aliment donné pour 100 g. */
export function nutrientsFor(food: Per100g, grams: number): Nutrients {
  const f = Math.max(0, grams) / 100;
  return { kcal: Math.round(food.kcal * f), proteinG: r1(food.proteinG * f), carbsG: r1(food.carbsG * f), fatG: r1(food.fatG * f) };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const s = items.reduce(
    (a, b) => ({ kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbsG: a.carbsG + b.carbsG, fatG: a.fatG + b.fatG }),
    { ...ZERO },
  );
  return { kcal: Math.round(s.kcal), proteinG: r1(s.proteinG), carbsG: r1(s.carbsG), fatG: r1(s.fatG) };
}

/** Valeurs pour 100 g d'une recette, à partir de ses ingrédients (poids cru = poids de la recette). */
export function recipePer100g(items: { food: Per100g; grams: number }[], cookedWeightG?: number): Per100g & { totalG: number } {
  const total = sumNutrients(items.map((i) => nutrientsFor(i.food, i.grams)));
  const weight = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : items.reduce((s, i) => s + i.grams, 0);
  if (weight <= 0) return { ...ZERO, totalG: 0 };
  const f = 100 / weight;
  return { kcal: Math.round(total.kcal * f), proteinG: r1(total.proteinG * f), carbsG: r1(total.carbsG * f), fatG: r1(total.fatG * f), totalG: weight };
}

/** Cohérence calories / macros (4-4-9) : écart relatif. Sert à repérer une saisie erronée. */
export function macroKcalGap(n: Per100g): number {
  const computed = n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
  if (n.kcal <= 0) return computed > 0 ? 1 : 0;
  return Math.abs(computed - n.kcal) / n.kcal;
}

export interface DayNutrition extends Nutrients {
  date: ISODate;
  /** Nombre d'aliments saisis (0 = jour non renseigné). */
  entries: number;
}

export interface NutritionReport {
  daysLogged: number;
  avg: Nutrients;
  /** Jours où les calories sont dans ±10 % de l'objectif. */
  daysOnTarget: number;
  /** Jours où l'objectif de protéines est atteint (≥ 90 %). */
  daysProteinOk: number;
}

/** Moyennes sur les jours RENSEIGNÉS uniquement (un jour vide n'est pas un jour à 0 kcal). */
export function nutritionReport(days: DayNutrition[], target: { kcal: number; proteinG: number }): NutritionReport {
  const logged = days.filter((d) => d.entries > 0);
  const n = logged.length;
  const avg = n ? sumNutrients(logged) : { ...ZERO };
  return {
    daysLogged: n,
    avg: n ? { kcal: Math.round(avg.kcal / n), proteinG: r1(avg.proteinG / n), carbsG: r1(avg.carbsG / n), fatG: r1(avg.fatG / n) } : avg,
    daysOnTarget: logged.filter((d) => Math.abs(d.kcal - target.kcal) <= target.kcal * 0.1).length,
    daysProteinOk: logged.filter((d) => d.proteinG >= target.proteinG * 0.9).length,
  };
}

export function lastNDays(today: ISODate, n: number): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** Allergènes connus de la base, et mots qui les désignent dans le champ libre « Allergies ». */
export const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  gluten: ['gluten', 'ble', 'celiaque', 'coeliaque', 'farine'],
  lactose: ['lactose', 'lait', 'laitier', 'laitiers'],
  egg: ['oeuf', 'oeufs', 'œuf', 'œufs'],
  peanut: ['arachide', 'arachides', 'cacahuete', 'cacahuetes', 'cacahouete'],
  nuts: ['fruits a coque', 'noix', 'amande', 'amandes', 'noisette', 'noisettes'],
  fish: ['poisson', 'poissons', 'sardine', 'thon'],
  sesame: ['sesame'],
};

const norm = normalizeText;

/** Allergènes de l'aliment qui correspondent aux allergies déclarées dans le profil. */
export function allergenMatches(profileAllergies: string, foodAllergens: string[] = []): string[] {
  const text = norm(profileAllergies);
  if (!text.trim()) return [];
  return foodAllergens.filter((a) => (ALLERGEN_KEYWORDS[a] ?? [a]).some((k) => new RegExp(`(^|[^a-z])${norm(k)}([^a-z]|$)`).test(text)));
}
