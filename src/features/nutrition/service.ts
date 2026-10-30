import { db } from '@/db/db';
import type { Food, MealItem, MealType, Recipe } from '@/db/types';
import { addDays, type ISODate } from '@/lib/dates';
import { nutrientsFor, recipePer100g, sumNutrients, type DayNutrition, type Nutrients } from '@/lib/nutrition';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner', 'extra'];

async function mealId(date: ISODate, type: MealType): Promise<number> {
  const existing = await db.meals.where('[date+type]').equals([date, type]).first();
  if (existing) return existing.id!;
  return (await db.meals.add({ date, type })) as number;
}

export function itemFor(food: Food, grams: number, unit?: { label: string; qty: number }): Omit<MealItem, 'id' | 'mealId'> {
  return { foodId: food.id!, grams, name: food.name, ...nutrientsFor(food, grams), unitLabel: unit?.label, qty: unit?.qty };
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
  const items = await db.mealItems.orderBy('id').reverse().limit(60).toArray();
  const ids = [...new Set(items.map((i) => i.foodId))].slice(0, limit);
  return (await db.foods.bulkGet(ids)).filter((f): f is Food => !!f);
}

/** Enregistre une recette et l'aliment « pour 100 g » qui permet de l'ajouter à un repas. */
export async function saveRecipe(recipe: Recipe): Promise<number> {
  return (await db.transaction('rw', db.recipes, db.foods, async () => {
    const foods = await db.foods.bulkGet(recipe.items.map((i) => i.foodId));
    const per = recipePer100g(recipe.items.map((i, k) => ({ food: foods[k]!, grams: i.grams })).filter((x) => x.food), recipe.cookedWeightG);
    const foodData: Food = {
      name: recipe.name,
      category: 'dish',
      kcal: per.kcal,
      proteinG: per.proteinG,
      carbsG: per.carbsG,
      fatG: per.fatG,
      estimated: false,
      source: 'Recette perso',
      units: [{ label: 'recette entière', grams: Math.round(per.totalG) }],
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
