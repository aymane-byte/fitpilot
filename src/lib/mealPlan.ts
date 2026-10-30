// Planificateur de repas : liste de courses agrégée (recettes développées en ingrédients crus),
// budget estimé en dirhams, repas fréquents.
import type { ISODate } from './dates';

export interface PlanItem {
  date: ISODate;
  foodId: number;
  grams: number;
}

export interface ShopFood {
  id: number;
  name: string;
  category?: string;
  recipeId?: number;
  /** Prix (DH) pour `grams` grammes. */
  price?: { mad: number; grams: number };
  units?: { label: string; grams: number }[];
}

export interface ShopRecipe {
  id: number;
  items: { foodId: number; grams: number }[];
  cookedWeightG?: number;
}

export interface ShopLine {
  foodId: number;
  name: string;
  category?: string;
  grams: number;
  /** Équivalent en unité maison (ex. « 3 × pièce »), si l'aliment en a une. */
  unitHint?: string;
  costMad?: number;
}

export interface ShoppingList {
  lines: ShopLine[];
  totalMad: number;
  /** Lignes sans prix (le budget est alors incomplet). */
  missingPrices: number;
}

/**
 * Agrège les quantités prévues. Une recette est remplacée par ses ingrédients crus au prorata :
 * 300 g d'un tajine dont la casserole pèse 1 200 g cuit → ¼ de chaque ingrédient.
 */
export function shoppingList(items: PlanItem[], foods: Map<number, ShopFood>, recipes: Map<number, ShopRecipe>): ShoppingList {
  const grams = new Map<number, number>();
  const add = (id: number, g: number) => grams.set(id, (grams.get(id) ?? 0) + g);
  for (const it of items) {
    const f = foods.get(it.foodId);
    if (!f) continue;
    const recipe = f.recipeId !== undefined ? recipes.get(f.recipeId) : undefined;
    if (recipe && recipe.items.length) {
      const raw = recipe.items.reduce((s, i) => s + i.grams, 0);
      const whole = recipe.cookedWeightG && recipe.cookedWeightG > 0 ? recipe.cookedWeightG : raw;
      const factor = whole > 0 ? it.grams / whole : 0;
      for (const ing of recipe.items) add(ing.foodId, ing.grams * factor);
    } else add(it.foodId, it.grams);
  }
  let totalMad = 0;
  let missingPrices = 0;
  const lines: ShopLine[] = [];
  for (const [id, g] of grams) {
    const f = foods.get(id);
    if (!f) continue;
    const rounded = Math.round(g / 10) * 10 || Math.round(g);
    const unit = f.units?.find((u) => u.grams > 0);
    const line: ShopLine = { foodId: id, name: f.name, category: f.category, grams: rounded };
    if (unit && g >= unit.grams * 0.75) line.unitHint = `${Math.ceil(g / unit.grams)} × ${unit.label}`;
    if (f.price && f.price.grams > 0) {
      line.costMad = Math.round(((g * f.price.mad) / f.price.grams) * 10) / 10;
      totalMad += line.costMad;
    } else missingPrices++;
    lines.push(line);
  }
  lines.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
  return { lines, totalMad: Math.round(totalMad), missingPrices };
}

/**
 * Prix indicatifs au Maroc (DH, marché / épicerie, 2026) pour les aliments fournis.
 * ESTIMATIONS : ils varient selon la ville et la saison, et sont modifiables dans l'app.
 */
export const DEFAULT_PRICES_MAD: Record<string, { mad: number; grams: number }> = {
  egg: { mad: 1.5, grams: 50 },
  egg_boiled: { mad: 1.5, grams: 50 },
  chicken_breast: { mad: 75, grams: 1000 },
  chicken_thigh: { mad: 45, grams: 1000 },
  beef_ground: { mad: 110, grams: 1000 },
  sardine_can: { mad: 8, grams: 85 },
  sardine_fresh: { mad: 20, grams: 1000 },
  tuna_water: { mad: 14, grams: 100 },
  tuna_oil: { mad: 14, grams: 100 },
  rice: { mad: 15, grams: 1000 },
  potato: { mad: 6, grams: 1000 },
  lentils: { mad: 18, grams: 1000 },
  white_beans: { mad: 20, grams: 1000 },
  chickpeas: { mad: 18, grams: 1000 },
  couscous: { mad: 14, grams: 1000 },
  pasta: { mad: 12, grams: 1000 },
  oats: { mad: 30, grams: 1000 },
  peas: { mad: 12, grams: 1000 },
  khobz: { mad: 1.5, grams: 180 },
  msemen: { mad: 2, grams: 80 },
  harcha: { mad: 2, grams: 70 },
  baghrir: { mad: 1.5, grams: 60 },
  milk_whole: { mad: 7, grams: 1000 },
  milk_semi: { mad: 7, grams: 1000 },
  yogurt: { mad: 2.5, grams: 110 },
  greek_yogurt: { mad: 9, grams: 150 },
  raib: { mad: 2.5, grams: 110 },
  lben: { mad: 6, grams: 1000 },
  banana: { mad: 15, grams: 1000 },
  apple: { mad: 15, grams: 1000 },
  orange: { mad: 6, grams: 1000 },
  dates: { mad: 60, grams: 1000 },
  avocado: { mad: 25, grams: 1000 },
  tomato: { mad: 6, grams: 1000 },
  cucumber: { mad: 6, grams: 1000 },
  onion: { mad: 5, grams: 1000 },
  carrot: { mad: 5, grams: 1000 },
  zucchini: { mad: 6, grams: 1000 },
  eggplant: { mad: 6, grams: 1000 },
  olive_oil: { mad: 90, grams: 1000 },
  olives: { mad: 30, grams: 1000 },
  almonds: { mad: 120, grams: 1000 },
  peanuts: { mad: 40, grams: 1000 },
  amlou: { mad: 150, grams: 1000 },
  honey: { mad: 150, grams: 1000 },
  sugar: { mad: 10, grams: 1000 },
};

export interface FrequentMeal {
  /** Identifiants d'aliments du repas (triés), et quantités moyennes. */
  items: { foodId: number; name: string; grams: number }[];
  count: number;
  lastDate: ISODate;
}

/**
 * Repas fréquents : combinaisons identiques d'aliments (au moins 2) notées au moins `minCount` fois.
 * Les quantités proposées sont celles de la dernière fois.
 */
export function frequentMeals(meals: { date: ISODate; items: { foodId: number; name: string; grams: number }[] }[], minCount = 2, limit = 5): FrequentMeal[] {
  const groups = new Map<string, FrequentMeal>();
  for (const m of [...meals].sort((a, b) => a.date.localeCompare(b.date))) {
    if (m.items.length < 2) continue;
    const key = [...new Set(m.items.map((i) => i.foodId))].sort((a, b) => a - b).join(',');
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.lastDate = m.date;
      g.items = m.items.map((i) => ({ ...i }));
    } else groups.set(key, { items: m.items.map((i) => ({ ...i })), count: 1, lastDate: m.date });
  }
  return [...groups.values()]
    .filter((g) => g.count >= minCount)
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

/** Portion d'une recette : poids total (cuit si connu) / nombre de portions. */
export function servingGrams(recipe: { items: { grams: number }[]; cookedWeightG?: number; servings?: number }): number | null {
  if (!recipe.servings || recipe.servings < 1) return null;
  const whole = recipe.cookedWeightG && recipe.cookedWeightG > 0 ? recipe.cookedWeightG : recipe.items.reduce((s, i) => s + i.grams, 0);
  return whole > 0 ? Math.round(whole / recipe.servings) : null;
}
