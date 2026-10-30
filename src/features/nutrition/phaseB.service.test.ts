import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, updateSettings } from '@/db/db';
import { ensureSeed } from '@/db/seed/seed';
import type { Food } from '@/db/types';
import { computeTargets } from '@/lib/energy';
import { addFood, addFrequentMeal, addPlanItem, addQuickItem, copyPlanToJournal, copyPlanWeek, dayItems, dayMicros, favoriteFoods, loadFrequentMeals, planWeek, recentFoods, saveRecipe, toggleFavorite, weekShopping } from './service';
import { analyzeMealPhoto, loadCiqual, lookupBarcode, materializeCiqual, searchCiqualFoods, VisionError } from './sources';
import { computeDayTargets, trainingDays } from './useDayTargets';
import { defaultProfileDraft } from '../onboarding/defaults';

const CIQUAL = readFileSync('public/data/ciqual-2020.json', 'utf-8');

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());

const food = async (f: Partial<Food> & { name: string }): Promise<Food> => {
  const row: Food = { category: 'dish', kcal: 100, proteinG: 10, carbsG: 10, fatG: 2, estimated: false, custom: true, ...f };
  return { ...row, id: (await db.foods.add(row)) as number };
};

describe('code-barres (Open Food Facts simulé)', () => {
  const offJson = { status: 1, product: { product_name_fr: 'Lben Jaouda', brands: 'Jaouda', serving_quantity: 200, nutriments: { 'energy-kcal_100g': 45, proteins_100g: 3, carbohydrates_100g: 4.6, fat_100g: 1.5, calcium_100g: 0.12, salt_100g: 0.1 } } };
  it('trouvé en ligne puis gardé pour le hors-ligne', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(offJson)));
    const res = await lookupBarcode('6111242100992', fetchMock as unknown as typeof fetch);
    expect(res.status).toBe('found');
    if (res.status !== 'found') return;
    expect(res.cached).toBe(false);
    expect(res.food).toMatchObject({ name: 'Lben Jaouda', kcal: 45, calciumMg: 120, saltG: 0.1, barcode: '6111242100992', source: 'Open Food Facts', category: 'packaged' });
    expect(res.food.units).toEqual([{ label: 'portion (emballage)', grams: 200 }]);
    // Hors-ligne : la base locale répond sans appel réseau.
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const again = await lookupBarcode('6111242100992', offline as unknown as typeof fetch);
    expect(again).toMatchObject({ status: 'found', cached: true });
    expect(offline).not.toHaveBeenCalled();
  });
  it('code invalide, introuvable, hors-ligne', async () => {
    expect((await lookupBarcode('123')).status).toBe('invalid');
    expect((await lookupBarcode('3017624010702')).status).toBe('invalid');
    expect((await lookupBarcode('3017624010701', (async () => new Response(JSON.stringify({ status: 0 }))) as unknown as typeof fetch)).status).toBe('notFound');
    expect((await lookupBarcode('3017624010701', (async () => new Response('', { status: 404 })) as unknown as typeof fetch)).status).toBe('notFound');
    expect(
      (
        await lookupBarcode('3017624010701', (async () => {
          throw new TypeError('x');
        }) as unknown as typeof fetch)
      ).status,
    ).toBe('offline');
  });
});

describe('CIQUAL (fichier réel)', () => {
  beforeEach(() => vi.stubGlobal('fetch', async () => new Response(CIQUAL)));
  it('recherche dans ~2 300 aliments, copie locale réutilisée', async () => {
    const idx = await loadCiqual();
    expect(idx.foods.length).toBeGreaterThan(2000);
    const hits = await searchCiqualFoods('lentille verte cuite');
    expect(hits[0].name).toMatch(/^Lentille verte, bouillie/);
    const local = await materializeCiqual(hits[0]);
    expect(local).toMatchObject({ ciqualCode: hits[0].code, source: 'CIQUAL 2020 (ANSES)', category: 'starch' });
    expect(local.fiberG).toBeGreaterThan(5);
    // Valeur modifiée par l'utilisateur : conservée, pas de doublon.
    await db.foods.update(local.id!, { kcal: 130 });
    const again = await materializeCiqual(hits[0]);
    expect(again.id).toBe(local.id);
    expect(again.kcal).toBe(130);
    expect(await db.foods.where('ciqualCode').equals(hits[0].code).count()).toBe(1);
  });
});

describe('journal : micros, ajout rapide, favoris, repas fréquents', () => {
  it('micronutriments enregistrés avec la portion ; ajout rapide estimé sans micros', async () => {
    const lent = await food({ name: 'Lentilles', fiberG: 8, ironMg: 2.5 });
    await addFood('2026-10-30', 'lunch', lent, 200);
    await addQuickItem('2026-10-30', 'lunch', { name: 'Sandwich', kcal: 450 });
    const items = (await dayItems('2026-10-30')).lunch;
    expect(items[0]).toMatchObject({ fiberG: 16, ironMg: 5 });
    expect(items[1]).toMatchObject({ name: 'Sandwich', kcal: 450, foodId: 0, estimated: true });
    const m = await dayMicros('2026-10-30');
    expect(m.fiberG).toEqual({ value: 16, coverage: 1 });
    // L'ajout rapide n'est pas proposé dans les récents.
    expect((await recentFoods()).map((f) => f.name)).toEqual(['Lentilles']);
  });
  it('favoris', async () => {
    const a = await food({ name: 'B' });
    await food({ name: 'A' });
    await toggleFavorite(a);
    expect((await favoriteFoods()).map((f) => f.name)).toEqual(['B']);
  });
  it('repas fréquent détecté puis ajouté en un toucher', async () => {
    const egg = await food({ name: 'Œuf', kcal: 143 });
    const khobz = await food({ name: 'Khobz', kcal: 265 });
    for (const d of ['2026-10-27', '2026-10-28']) {
      await addFood(d, 'breakfast', egg, 100);
      await addFood(d, 'breakfast', khobz, 90);
    }
    const fm = await loadFrequentMeals('2026-10-30');
    expect(fm).toHaveLength(1);
    expect(fm[0].count).toBe(2);
    await addFrequentMeal('2026-10-30', 'breakfast', fm[0]);
    expect((await dayItems('2026-10-30')).breakfast.map((i) => i.name)).toEqual(['Œuf', 'Khobz']);
  });
});

describe('recettes, menus et courses', () => {
  it('recette : portions, micronutriments complets seulement', async () => {
    const chicken = await food({ name: 'Poulet', kcal: 165, fiberG: 0, ironMg: 0.4 });
    const onion = await food({ name: 'Oignon', kcal: 40, fiberG: 1.7 });
    const rid = await saveRecipe({ name: 'Tajine', items: [{ foodId: chicken.id!, grams: 800 }, { foodId: onion.id!, grams: 400 }], cookedWeightG: 1000, servings: 4 });
    const f = (await db.foods.where('recipeId').equals(rid).first())!;
    expect(f.units?.[0]).toEqual({ label: 'portion', grams: 250 });
    expect(f.fiberG).toBeCloseTo(0.68, 2); // 400 × 1,7 % / 1 000 g × 100
    expect(f.ironMg).toBeUndefined(); // l'oignon ne renseigne pas le fer
  });
  it('menus → journal, copie de semaine, liste de courses avec budget', async () => {
    const chicken = await food({ name: 'Poulet', category: 'protein', price: { mad: 75, grams: 1000 } });
    const rice = await food({ name: 'Riz', category: 'starch', price: { mad: 15, grams: 1000 } });
    await addPlanItem('2026-11-02', 'lunch', chicken, 200);
    await addPlanItem('2026-11-02', 'lunch', rice, 180);
    await addPlanItem('2026-11-03', 'dinner', chicken, 200);
    expect(await planWeek('2026-11-02')).toHaveLength(3);
    expect(await copyPlanToJournal('2026-11-02')).toBe(2);
    expect((await dayItems('2026-11-02')).lunch).toHaveLength(2);
    const shop = await weekShopping('2026-11-02');
    expect(shop.lines.find((l) => l.name === 'Poulet')).toMatchObject({ grams: 400, costMad: 30 });
    expect(shop.totalMad).toBe(33); // 30 + 2,7
    expect(await copyPlanWeek('2026-11-02')).toBe(3);
    expect(await planWeek('2026-11-09')).toHaveLength(3);
  });
});

describe('objectifs du jour (planning réel)', () => {
  const profile = { ...defaultProfileDraft(1), name: 'A' };
  const base = computeTargets({ weightKg: 78, heightCm: 170, age: 20, gender: 'male', activity: 'moderate', goal: 'recomp' });
  it('jours d’entraînement d’après le planning et les séances faites', async () => {
    await db.scheduledActivities.bulkAdd([
      { date: '2026-11-02', kind: 'workout', title: 'Haut', status: 'planned' },
      { date: '2026-11-04', kind: 'run', title: 'Footing', status: 'planned' },
      { date: '2026-11-05', kind: 'run', title: 'X', status: 'skipped' },
      { date: '2026-11-06', kind: 'rest', title: 'Repos', status: 'planned' },
    ]);
    await db.runs.add({ date: '2026-11-07', type: 'easy', distanceKm: 5, durationSec: 1800, source: 'manual', createdAt: 1 });
    expect(await trainingDays('2026-11-02', profile)).toEqual({ isTraining: true, count: 3, fromPlan: true });
    expect((await trainingDays('2026-11-06', profile)).isTraining).toBe(false);
    expect((await trainingDays('2026-11-16', profile)).fromPlan).toBe(false);
  });
  it('cyclage et Ramadan appliqués selon les paramètres', async () => {
    await db.scheduledActivities.add({ date: '2026-11-02', kind: 'workout', title: 'Haut', status: 'planned' });
    expect((await computeDayTargets('2026-11-02', profile, base)).calories).toBe(base.calories);
    await updateSettings({ calorieCycling: { enabled: true, pct: 0.1 } });
    const train = await computeDayTargets('2026-11-02', profile, base);
    const rest = await computeDayTargets('2026-11-03', profile, base);
    expect(train.calories).toBeGreaterThan(base.calories);
    expect(rest.calories).toBeLessThan(base.calories);
    expect(train.reasons).toEqual(['training']);
  });
});

describe('aliments fournis : micronutriments CIQUAL et prix (seed v3)', () => {
  it('ajoutés sans écraser une valeur modifiée', async () => {
    await ensureSeed();
    const rice = (await db.foods.where('key').equals('rice').first())!;
    expect(rice.fiberG).toBeDefined();
    expect(rice.price).toEqual({ mad: 15, grams: 1000 });
    expect(rice.ciqualCode).toBeUndefined(); // un aliment CIQUAL choisi dans la recherche reste distinct
    const harira = (await db.foods.where('key').equals('harira').first())!;
    expect(harira.fiberG).toBeUndefined(); // plat estimé : micros inconnus
    // Mise à jour d'un téléphone en v2 où l'utilisateur a modifié le prix du riz.
    await db.foods.update(rice.id!, { price: { mad: 20, grams: 1000 }, fiberG: undefined });
    await updateSettings({ seedVersion: 2 });
    await ensureSeed();
    const after = (await db.foods.get(rice.id!))!;
    expect(after.price).toEqual({ mad: 20, grams: 1000 });
    expect(after.fiberG).toBeDefined();
  });
});

describe('photo de plat (Gemini simulé)', () => {
  it('sans clé : refusé ; avec clé : image envoyée, aliments renvoyés', async () => {
    const img = new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' });
    await expect(analyzeMealPhoto(img)).rejects.toMatchObject({ code: 'noKey' });
    await updateSettings({ geminiApiKey: 'AIza-test' });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: 'image/jpeg', data: btoa(String.fromCharCode(255, 216, 255)) });
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[{"name":"Couscous","grams":300,"kcal":420,"proteinG":15,"carbsG":60,"fatG":12}]}' }] } }] }));
    });
    const items = await analyzeMealPhoto(img, fetchMock as unknown as typeof fetch);
    expect(items).toEqual([{ name: 'Couscous', grams: 300, kcal: 420, proteinG: 15, carbsG: 60, fatG: 12 }]);
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    await expect(analyzeMealPhoto(img, (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch)).rejects.toBeInstanceOf(VisionError);
  });
});
