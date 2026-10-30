import { db } from '@/db/db';
import type { Food, MealItem, MealPlanItem, MealType, Recipe } from '@/db/types';
import { addDays, startOfWeek, type ISODate } from '@/lib/dates';
import { nutrientsFor, recipeMicrosPer100g, recipePer100g, sumNutrients, type DayNutrition, type Nutrients } from '@/lib/nutrition';
import { MICRO_KEYS, microsFor, microTotals, type MicroKey, type MicroTotal, type Micros } from '@/lib/micros';
import { frequentMeals, servingGrams, shoppingList, type FrequentMeal, type ShopFood, type ShopRecipe } from '@/lib/mealPlan';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner', 'extra'];

async function mealId(date: ISODate, type: MealType): Promise<number> {
  const existing = await db.meals.where('[date+type]').equals([date, type]).first();
  if (existing) return existing.id!;
  return (await db.meals.add({ date, type })) as number;
}

export function itemFor(food: Food, grams: number, unit?: { label: string; qty: number }): Omit<MealItem, 'id' | 'mealId'> {
  return { foodId: food.id!, grams, name: food.name, ...nutrientsFor(food, grams), ...microsFor(food, grams), unitLabel: unit?.label, qty: unit?.qty, ...(food.estimated ? { estimated: true } : {}) };
}

/** Identifiant d'aliment réservé aux ajouts rapides (pas d'aliment en base). */
export const QUICK_FOOD_ID = 0;

/** Ajout rapide : calories et macros saisies directement (ou issues de l'analyse photo, marquées estimées). */
export async function addQuickItem(date: ISODate, type: MealType, v: { name: string; kcal: number; proteinG?: number; carbsG?: number; fatG?: number; grams?: number; estimated?: boolean }) {
  await db.transaction('rw', db.meals, db.mealItems, async () => {
    await db.mealItems.add({
      mealId: await mealId(date, type),
      foodId: QUICK_FOOD_ID,
      grams: v.grams ?? 0,
      name: v.name,
      kcal: Math.round(v.kcal),
      proteinG: v.proteinG ?? 0,
      carbsG: v.carbsG ?? 0,
      fatG: v.fatG ?? 0,
      estimated: v.estimated ?? true,
    });
  });
}

export async function addFood(date: ISODate, type: MealType, food: Food, grams: number, unit?: { label: string; qty: number }) {
  await db.transaction('rw', db.meals, db.mealItems, async () => {
    await db.mealItems.add({ ...itemFor(food, grams, unit), mealId: await mealId(date, type) });
  });
}

/** Aliments d'une journée, groupés par repas. */
export async function dayItems(date: ISODate): Promise<Record<MealType, MealItem[]>> {
  const meals = await db.meals.where('date').equals(date).toArray();
  const out = Object.fromEntries(MEAL_TYPES.map((t) => [t, [] as MealItem[]])) as Record<MealType, MealItem[]>;
  if (!meals.length) return out;
  const items = await db.mealItems.where('mealId').anyOf(meals.map((m) => m.id!)).toArray();
  for (const m of meals) out[m.type] = items.filter((i) => i.mealId === m.id);
  return out;
}

export function totalsOf(items: Nutrients[]): Nutrients {
  return sumNutrients(items);
}

/** Totaux par jour sur une plage (pour rapports et coach). */
export async function daysNutrition(dates: ISODate[]): Promise<DayNutrition[]> {
  if (!dates.length) return [];
  const meals = await db.meals.where('date').between(dates[0], dates.at(-1)!, true, true).toArray();
  const items = meals.length ? await db.mealItems.where('mealId').anyOf(meals.map((m) => m.id!)).toArray() : [];
  const dateOf = new Map(meals.map((m) => [m.id!, m.date]));
  return dates.map((date) => {
    const list = items.filter((i) => dateOf.get(i.mealId) === date);
    return { date, entries: list.length, ...sumNutrients(list) };
  });
}

/** Copie un repas d'un jour à un autre (ex. « Copier d'hier »). */
export async function copyMeal(from: ISODate, to: ISODate, type: MealType) {
  const src = await db.meals.where('[date+type]').equals([from, type]).first();
  if (!src) return 0;
  const items = await db.mealItems.where('mealId').equals(src.id!).toArray();
  await db.transaction('rw', db.meals, db.mealItems, async () => {
    const target = await mealId(to, type);
    await db.mealItems.bulkAdd(items.map(({ id: _id, ...rest }) => ({ ...rest, mealId: target })));
  });
  return items.length;
}

export async function yesterdayHas(date: ISODate, type: MealType): Promise<boolean> {
  const src = await db.meals.where('[date+type]').equals([addDays(date, -1), type]).first();
  return !!src && (await db.mealItems.where('mealId').equals(src.id!).count()) > 0;
}

/** Aliments utilisés récemment (les plus récents d'abord, sans doublon). */
export async function recentFoods(limit = 8): Promise<Food[]> {
  const items = await db.mealItems.orderBy('id').reverse().limit(80).toArray();
  const ids = [...new Set(items.map((i) => i.foodId).filter((id) => id !== QUICK_FOOD_ID))].slice(0, limit);
  return (await db.foods.bulkGet(ids)).filter((f): f is Food => !!f);
}

export async function favoriteFoods(): Promise<Food[]> {
  return (await db.foods.filter((f) => !!f.favorite).toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function toggleFavorite(food: Food) {
  await db.foods.update(food.id!, { favorite: !food.favorite });
}

/** Repas fréquents des 60 derniers jours (mêmes aliments notés au moins 2 fois). */
export async function loadFrequentMeals(today: ISODate): Promise<FrequentMeal[]> {
  const meals = await db.meals.where('date').between(addDays(today, -60), today, true, true).toArray();
  if (!meals.length) return [];
  const items = await db.mealItems.where('mealId').anyOf(meals.map((m) => m.id!)).toArray();
  const byMeal = new Map<number, MealItem[]>();
  for (const i of items) if (i.foodId !== QUICK_FOOD_ID) byMeal.set(i.mealId, [...(byMeal.get(i.mealId) ?? []), i]);
  return frequentMeals(meals.map((m) => ({ date: m.date, items: (byMeal.get(m.id!) ?? []).map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams })) })));
}

/** Ajoute un repas fréquent (aliments encore présents en base, valeurs actuelles). */
export async function addFrequentMeal(date: ISODate, type: MealType, meal: FrequentMeal) {
  const foods = await db.foods.bulkGet(meal.items.map((i) => i.foodId));
  await db.transaction('rw', db.meals, db.mealItems, async () => {
    const id = await mealId(date, type);
    const rows = meal.items.map((i, k) => (foods[k] ? { ...itemFor(foods[k]!, i.grams), mealId: id } : null)).filter((x): x is MealItem => !!x);
    await db.mealItems.bulkAdd(rows);
  });
}

/** Micronutriments d'une journée. */
export async function dayMicros(date: ISODate): Promise<Record<MicroKey, MicroTotal>> {
  const items = Object.values(await dayItems(date)).flat();
  return microTotals(items.filter((i) => i.foodId !== QUICK_FOOD_ID));
}

export function microsOfItems(items: (Micros & { grams: number; foodId: number })[]) {
  return microTotals(items.filter((i) => i.foodId !== QUICK_FOOD_ID));
}

export { MICRO_KEYS };

// ---------- Planificateur de repas ----------

export async function addPlanItem(date: ISODate, type: MealType, food: Food, grams: number, unit?: { label: string; qty: number }) {
  await db.mealPlans.add({ date, type, foodId: food.id!, grams, name: food.name, unitLabel: unit?.label, qty: unit?.qty });
}

export async function planWeek(monday: ISODate): Promise<MealPlanItem[]> {
  return db.mealPlans.where('date').between(monday, addDays(monday, 6), true, true).toArray();
}

/** Copie les repas prévus d'un jour dans le journal (valeurs actuelles des aliments). */
export async function copyPlanToJournal(date: ISODate): Promise<number> {
  const plan = await db.mealPlans.where('date').equals(date).toArray();
  const foods = await db.foods.bulkGet(plan.map((p) => p.foodId));
  let n = 0;
  await db.transaction('rw', db.meals, db.mealItems, async () => {
    for (const [k, p] of plan.entries()) {
      const f = foods[k];
      if (!f) continue;
      await db.mealItems.add({ ...itemFor(f, p.grams, p.unitLabel ? { label: p.unitLabel, qty: p.qty ?? 1 } : undefined), mealId: await mealId(date, p.type) });
      n++;
    }
  });
  return n;
}

/** Copie la semaine prévue vers la semaine suivante (même jour, même repas). */
export async function copyPlanWeek(monday: ISODate): Promise<number> {
  const items = await planWeek(monday);
  await db.mealPlans.bulkAdd(items.map(({ id: _id, ...rest }) => ({ ...rest, date: addDays(rest.date, 7) })));
  return items.length;
}

export async function weekShopping(monday: ISODate) {
  const items = await planWeek(monday);
  const foods = await db.foods.toArray();
  const recipes = await db.recipes.toArray();
  const fm = new Map<number, ShopFood>(foods.map((f) => [f.id!, { id: f.id!, name: f.name, category: f.category, recipeId: f.recipeId, price: f.price, units: f.units }]));
  const rm = new Map<number, ShopRecipe>(recipes.map((r) => [r.id!, { id: r.id!, items: r.items, cookedWeightG: r.cookedWeightG }]));
  return shoppingList(items, fm, rm);
}

export const weekKey = (date: ISODate) => startOfWeek(date);

/** Enregistre une recette et l'aliment « pour 100 g » qui permet de l'ajouter à un repas. */
export async function saveRecipe(recipe: Recipe): Promise<number> {
  return (await db.transaction('rw', db.recipes, db.foods, async () => {
    const foods = await db.foods.bulkGet(recipe.items.map((i) => i.foodId));
    const parts = recipe.items.map((i, k) => ({ food: foods[k]!, grams: i.grams })).filter((x) => x.food);
    const per = recipePer100g(parts, recipe.cookedWeightG);
    const micros = recipeMicrosPer100g(parts, recipe.cookedWeightG);
    const foodData: Food = {
      name: recipe.name,
      category: 'dish',
      kcal: per.kcal,
      proteinG: per.proteinG,
      carbsG: per.carbsG,
      fatG: per.fatG,
      ...micros,
      estimated: parts.some((p) => p.food.estimated),
      source: 'Recette perso',
      units: [
        ...(servingGrams(recipe) ? [{ label: 'portion', grams: servingGrams(recipe)! }] : []),
        { label: 'recette entière', grams: Math.round(per.totalG) },
      ],
      custom: true,
    };
    let recipeId = recipe.id;
    if (recipeId === undefined) recipeId = (await db.recipes.add({ ...recipe })) as number;
    let foodId = recipe.foodId;
    if (foodId !== undefined && (await db.foods.get(foodId))) await db.foods.update(foodId, { ...foodData, recipeId });
    else foodId = (await db.foods.add({ ...foodData, recipeId })) as number;
    await db.recipes.put({ ...recipe, id: recipeId, foodId });
    return recipeId;
  })) as number;
}
