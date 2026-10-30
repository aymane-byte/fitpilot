import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { addFood, copyMeal, dayItems, daysNutrition, saveRecipe } from './service';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

// Fabrique : Dexie écrit l'id généré dans l'objet ajouté, il ne faut pas le réutiliser.
const rice = () => ({ name: 'Riz', category: 'starch', kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, estimated: false, custom: false });

describe('journal alimentaire', () => {
  it('ajoute, regroupe par repas et totalise par jour', async () => {
    const id = (await db.foods.add(rice())) as number;
    const food = (await db.foods.get(id))!;
    await addFood('2026-10-30', 'lunch', food, 180, { label: 'bol', qty: 1 });
    await addFood('2026-10-30', 'dinner', food, 100);
    const items = await dayItems('2026-10-30');
    expect(items.lunch).toHaveLength(1);
    expect(items.lunch[0]).toMatchObject({ name: 'Riz', kcal: 234, unitLabel: 'bol' });
    const [day] = await daysNutrition(['2026-10-30']);
    expect(day).toMatchObject({ entries: 2, kcal: 364 });
  });

  it('l’historique ne change pas si l’aliment est modifié', async () => {
    const id = (await db.foods.add(rice())) as number;
    await addFood('2026-10-30', 'lunch', (await db.foods.get(id))!, 100);
    await db.foods.update(id, { kcal: 999 });
    expect((await dayItems('2026-10-30')).lunch[0].kcal).toBe(130);
  });

  it('copie le repas d’hier', async () => {
    const id = (await db.foods.add(rice())) as number;
    await addFood('2026-10-29', 'breakfast', (await db.foods.get(id))!, 50);
    expect(await copyMeal('2026-10-29', '2026-10-30', 'breakfast')).toBe(1);
    expect((await dayItems('2026-10-30')).breakfast).toHaveLength(1);
  });

  it('une recette crée un aliment pour 100 g, mis à jour quand on la modifie', async () => {
    const id = (await db.foods.add(rice())) as number;
    const oil = (await db.foods.add({ ...rice(), name: 'Huile', kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 })) as number;
    const rid = await saveRecipe({ name: 'Riz à l’huile', items: [{ foodId: id, grams: 200 }, { foodId: oil, grams: 20 }] });
    const recipe = (await db.recipes.get(rid))!;
    expect((await db.foods.get(recipe.foodId!))!.kcal).toBe(199);
    await saveRecipe({ ...recipe, items: [{ foodId: id, grams: 200 }] });
    expect((await db.foods.get(recipe.foodId!))!.kcal).toBe(130);
    expect(await db.foods.where('recipeId').equals(rid).count()).toBe(1);
  });
});
