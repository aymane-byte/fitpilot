import { describe, expect, it } from 'vitest';
import { averageMicros, microsFor, microStatus, microTargets, microTotals, sodiumMgFromSalt } from './micros';
import { isValidBarcode, offProductUrl, parseOffProduct } from './openFoodFacts';
import { buildIndex, ciqualCategory, ciqualRows, searchCiqual, type CiqualFile } from './ciqual';
import { cycledCalories, dayTargets, isValidTime, ramadanPlan } from './dayTargets';
import { frequentMeals, servingGrams, shoppingList, type ShopFood, type ShopRecipe } from './mealPlan';
import { parseVisionResponse, rescaleItem, visionRequestBody } from './foodVision';
import { computeTargets } from './energy';

const base = computeTargets({ weightKg: 78, heightCm: 170, age: 20, gender: 'male', activity: 'moderate', goal: 'recomp' });

describe('micronutriments', () => {
  it('objectifs selon le profil', () => {
    const m = microTargets({ gender: 'male', age: 20 }, 2440);
    expect(m.fiberG).toMatchObject({ kind: 'min', value: 30 });
    expect(m.saltG).toMatchObject({ kind: 'max', value: 5 });
    expect(m.satFatG.value).toBe(27); // 10 % de 2 440 kcal / 9
    expect(m.ironMg.value).toBe(11);
    expect(m.calciumMg.value).toBe(1000); // 18–24 ans
    expect(microTargets({ gender: 'female', age: 30 }, 2000).ironMg.value).toBe(16);
    expect(microTargets({ gender: 'female', age: 55 }, 2000).ironMg.value).toBe(11);
    expect(microTargets({ gender: 'male', age: 40 }, 2000).calciumMg.value).toBe(950);
  });
  it('portion et totaux : une valeur inconnue n’est pas un zéro', () => {
    expect(microsFor({ fiberG: 8.45, ironMg: 2.45 }, 200)).toEqual({ fiberG: 16.9, ironMg: 4.9 });
    const tot = microTotals([
      { grams: 200, fiberG: 16.9 },
      { grams: 100 }, // fibres inconnues
      { grams: 100, fiberG: 2 },
    ]);
    expect(tot.fiberG).toEqual({ value: 18.9, coverage: 0.75 });
    expect(tot.vitDUg).toEqual({ value: 0, coverage: 0 });
  });
  it('statuts : bas, élevé, OK, inconnu', () => {
    const t = microTargets({ gender: 'male', age: 20 }, 2440);
    expect(microStatus({ value: 15, coverage: 1 }, t.fiberG)).toBe('low');
    expect(microStatus({ value: 25, coverage: 1 }, t.fiberG)).toBe('ok');
    expect(microStatus({ value: 7, coverage: 1 }, t.saltG)).toBe('high');
    expect(microStatus({ value: 1, coverage: 0.3 }, t.fiberG)).toBe('unknown');
    expect(sodiumMgFromSalt(5)).toBe(2000);
  });
  it('moyenne sur plusieurs jours', () => {
    const d = (v: number) => microTotals([{ grams: 100, fiberG: v }]);
    expect(averageMicros([d(20), d(30)]).fiberG).toEqual({ value: 25, coverage: 1 });
    expect(averageMicros([]).fiberG.value).toBe(0);
  });
});

describe('Open Food Facts', () => {
  it('clé de contrôle EAN', () => {
    expect(isValidBarcode('3017624010701')).toBe(true); // Nutella
    expect(isValidBarcode('3017624010702')).toBe(false);
    expect(isValidBarcode('96385074')).toBe(true); // EAN-8
    expect(isValidBarcode('036000291452')).toBe(true); // UPC-A
    expect(isValidBarcode('12ab')).toBe(false);
  });
  it('URL avec les seuls champs utiles', () => {
    expect(offProductUrl('3017624010701')).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3017624010701\.json\?fields=code,product_name/);
  });
  it('conversion du produit : unités (g → mg / µg), sel depuis le sodium, allergènes', () => {
    const json = {
      status: 1,
      product: {
        product_name_fr: 'Pâte à tartiner',
        brands: 'Ferrero, Nutella',
        serving_quantity: '15',
        allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
        nutriscore_grade: 'e',
        nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, 'saturated-fat_100g': 10.6, sugars_100g: 56.3, sodium_100g: 0.0428, fiber_100g: '0', calcium_100g: 0.108, 'vitamin-d_100g': 0.0000025 },
      },
    };
    const f = parseOffProduct(json, '3017624010701')!;
    expect(f).toMatchObject({ barcode: '3017624010701', name: 'Pâte à tartiner', brand: 'Ferrero', kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, servingG: 15, nutriscore: 'E' });
    expect(f.allergens).toEqual(['lactose', 'nuts']);
    expect(f.saltG).toBe(0.11);
    expect(f.calciumMg).toBe(108);
    expect(f.vitDUg).toBe(2.5);
    expect(f.fiberG).toBe(0);
    expect(f.ironMg).toBeUndefined();
  });
  it('kJ seulement → kcal ; produit inconnu ou sans calories → null', () => {
    expect(parseOffProduct({ status: 1, product: { product_name: 'X', nutriments: { energy_100g: 1000 } } }, '1')!.kcal).toBe(239);
    expect(parseOffProduct({ status: 0 }, '1')).toBeNull();
    expect(parseOffProduct({ status: 1, product: { product_name: 'X', nutriments: {} } }, '1')).toBeNull();
    expect(parseOffProduct({ status: 1, product: { nutriments: { 'energy-kcal_100g': 50 } } }, '42')!.name).toBe('Produit 42');
  });
});

describe('CIQUAL', () => {
  const file: CiqualFile = {
    source: 'test',
    fields: [],
    groups: { '02': 'fruits, légumes, légumineuses', '03': 'céréales', '04': 'viandes' },
    foods: [
      [20587, 'Lentille verte, bouillie/cuite à l’eau', '02', 127, 10.1, 16.2, 0.58, 0.2, 8.45, 0.015, 0.09, 2.45, 39.5, 215, 0.25, null],
      [7001, 'Pain, baguette, courante', '03', 287, 8.27, 58.3, 1.4, 2.3, 2.7, 1.3, 0.45, 1.2, 22, 180, 0.25, null],
      [22000, 'Œuf, dur', '04', 134, 13.5, 0.27, 8.62, 0.27, 0, 0.3, 2.66, 1.6, 50, 140, 1.9, 1.11],
      [13000, 'Banane, pulpe, crue', '02', 90, 1.06, 19.7, 0.25, 15.6, 2.7, 0, 0.1, 0.3, 5, 320, 0, 0],
    ],
  };
  const rows = ciqualRows(file);
  it('lecture des lignes : macros et micros, valeur absente = inconnue', () => {
    expect(rows[0]).toMatchObject({ code: 20587, kcal: 127, proteinG: 10.1, fiberG: 8.45, ironMg: 2.45, vitDUg: 0.25 });
    expect(rows[0].b12Ug).toBeUndefined();
  });
  it('recherche sans accents, tous les mots, meilleur classement', () => {
    const idx = buildIndex(rows);
    expect(searchCiqual(idx, 'oeuf')[0].code).toBe(22000);
    expect(searchCiqual(idx, 'lentille cuite').map((f) => f.code)).toEqual([20587]);
    expect(searchCiqual(idx, 'pain')[0].code).toBe(7001);
    expect(searchCiqual(idx, 'x')).toEqual([]);
  });
  it('catégories', () => {
    expect(ciqualCategory(rows[0])).toBe('starch');
    expect(ciqualCategory(rows[1])).toBe('bread');
    expect(ciqualCategory(rows[2])).toBe('protein');
    expect(ciqualCategory(rows[3])).toBe('fruit');
  });
});

describe('objectifs du jour : cyclage et Ramadan', () => {
  it('cyclage : la moyenne hebdomadaire reste l’objectif de base', () => {
    for (const n of [2, 3, 4, 5]) {
      const train = cycledCalories(base, true, n);
      const rest = cycledCalories(base, false, n);
      expect(train).toBeGreaterThan(base.calories);
      expect(rest).toBeLessThan(base.calories);
      const avg = (train * n + rest * (7 - n)) / 7;
      expect(Math.abs(avg - base.calories)).toBeLessThan(15); // arrondi à 10 kcal près
      expect(rest).toBeGreaterThanOrEqual(base.bmr);
      expect(rest).toBeGreaterThanOrEqual(base.calories * 0.85 - 5);
    }
  });
  it('cyclage impossible sans jour de repos ou sans entraînement', () => {
    expect(cycledCalories(base, true, 7)).toBe(base.calories);
    expect(cycledCalories(base, false, 0)).toBe(base.calories);
  });
  it('jour de repos jamais sous le BMR', () => {
    const tight = { calories: 1800, bmr: 1750 };
    expect(cycledCalories(tight, false, 5)).toBeGreaterThanOrEqual(1750);
  });
  it('protéines constantes, glucides ajustés', () => {
    const d = dayTargets(base, { cycling: { enabled: true, isTraining: true, trainingDays: 5 } });
    expect(d.proteinG).toBe(base.proteinG);
    expect(d.carbsG).toBeGreaterThan(base.carbsG);
    expect(d.reasons).toEqual(['training']);
    expect(dayTargets(base, {}).calories).toBe(base.calories);
  });
  it('Ramadan : déficit plafonné à 10 % de la dépense', () => {
    const loss = computeTargets({ weightKg: 78, heightCm: 170, age: 20, gender: 'male', activity: 'moderate', goal: 'fat_loss' });
    const d = dayTargets(loss, { ramadan: { enabled: true, suhoor: '04:50', iftar: '19:05' } });
    expect(d.calories).toBeGreaterThanOrEqual(Math.round(loss.tdee * 0.9) - 10);
    expect(d.reasons).toContain('ramadan_cap');
    // Recomposition (−10 %) : déjà dans la limite.
    expect(dayTargets(base, { ramadan: { enabled: true, suhoor: '04:50', iftar: '19:05' } }).reasons).toEqual([]);
  });
  it('plan Ramadan : jeûne, eau répartie entre ftour et s’hour, créneaux d’entraînement', () => {
    const p = ramadanPlan({ suhoor: '04:50', iftar: '19:05' }, 2750)!;
    expect(p.fastingMin).toBe(14 * 60 + 15);
    expect(p.eatingMin).toBe(9 * 60 + 45);
    expect(p.water[0].at).toBe('19:05');
    expect(p.water.reduce((s, w) => s + w.ml, 0)).toBe(2750);
    expect(p.water.every((w) => w.at >= '19:05' || w.at <= '04:50')).toBe(true);
    expect(p.training).toEqual([
      { from: '17:50', to: '18:50', kind: 'light' },
      { from: '20:35', to: '22:05', kind: 'intense' },
    ]);
    expect(ramadanPlan({ suhoor: 'xx', iftar: '19:00' }, 2000)).toBeNull();
    expect(isValidTime('4:50')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
  });
});

describe('menus et courses', () => {
  const foods = new Map<number, ShopFood>([
    [1, { id: 1, name: 'Poulet', category: 'protein', price: { mad: 75, grams: 1000 } }],
    [2, { id: 2, name: 'Oignon', category: 'veg', price: { mad: 5, grams: 1000 }, units: [{ label: 'pièce', grams: 100 }] }],
    [3, { id: 3, name: 'Huile d’olive', category: 'fat' }],
    [10, { id: 10, name: 'Tajine perso', category: 'dish', recipeId: 100 }],
    [4, { id: 4, name: 'Œuf', category: 'protein', price: { mad: 1.5, grams: 50 }, units: [{ label: 'pièce', grams: 50 }] }],
  ]);
  const recipes = new Map<number, ShopRecipe>([[100, { id: 100, items: [{ foodId: 1, grams: 800 }, { foodId: 2, grams: 300 }, { foodId: 3, grams: 40 }], cookedWeightG: 1000 }]]);
  it('recettes développées au prorata, agrégation, budget', () => {
    const list = shoppingList(
      [
        { date: '2026-11-02', foodId: 10, grams: 500 }, // moitié de la casserole
        { date: '2026-11-03', foodId: 10, grams: 500 },
        { date: '2026-11-03', foodId: 4, grams: 150 },
      ],
      foods,
      recipes,
    );
    const by = Object.fromEntries(list.lines.map((l) => [l.name, l]));
    expect(by['Poulet'].grams).toBe(800);
    expect(by['Poulet'].costMad).toBe(60);
    expect(by['Oignon']).toMatchObject({ grams: 300, unitHint: '3 × pièce', costMad: 1.5 });
    expect(by['Œuf']).toMatchObject({ grams: 150, unitHint: '3 × pièce', costMad: 4.5 });
    expect(by['Huile d’olive'].costMad).toBeUndefined();
    expect(list.totalMad).toBe(66);
    expect(list.missingPrices).toBe(1);
    expect(list.lines.find((l) => l.name === 'Tajine perso')).toBeUndefined();
  });
  it('repas fréquents', () => {
    const meal = (date: string, ids: number[], g = 100) => ({ date, items: ids.map((foodId) => ({ foodId, name: `f${foodId}`, grams: g })) });
    const fm = frequentMeals([meal('2026-10-01', [1, 2]), meal('2026-10-02', [2, 1], 120), meal('2026-10-03', [3, 4]), meal('2026-10-04', [5])]);
    expect(fm).toHaveLength(1);
    expect(fm[0]).toMatchObject({ count: 2, lastDate: '2026-10-02' });
    expect(fm[0].items[0].grams).toBe(120);
  });
  it('portion d’une recette', () => {
    expect(servingGrams({ items: [{ grams: 600 }, { grams: 600 }], cookedWeightG: 1000, servings: 4 })).toBe(250);
    expect(servingGrams({ items: [{ grams: 600 }], servings: 3 })).toBe(200);
    expect(servingGrams({ items: [{ grams: 600 }] })).toBeNull();
  });
});

describe('photo de plat (Gemini)', () => {
  it('requête avec image et réponse JSON', () => {
    const body = visionRequestBody('AAAA', 'image/jpeg');
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });
  it('analyse : lignes valides gardées, aberrantes ignorées', () => {
    const json = {
      candidates: [
        {
          content: {
            parts: [{ text: '```json\n{"items":[{"name":"Tajine de poulet","grams":350,"kcal":420,"proteinG":32,"carbsG":18,"fatG":24},{"name":"Khobz","grams":"90","kcal":"240","proteinG":7,"carbsG":46,"fatG":3},{"name":"Erreur","grams":10,"kcal":900,"proteinG":0,"carbsG":0,"fatG":0},{"name":"","grams":5}]}\n```' }],
          },
        },
      ],
    };
    const items = parseVisionResponse(json);
    expect(items.map((i) => i.name)).toEqual(['Tajine de poulet', 'Khobz']);
    expect(items[1].grams).toBe(90);
    expect(parseVisionResponse({ candidates: [{ content: { parts: [{ text: 'pas du json' }] } }] })).toEqual([]);
    expect(parseVisionResponse({})).toEqual([]);
  });
  it('correction de la quantité : valeurs proportionnelles', () => {
    expect(rescaleItem({ name: 'Riz', grams: 200, kcal: 260, proteinG: 5.4, carbsG: 56.4, fatG: 0.6 }, 100)).toEqual({ name: 'Riz', grams: 100, kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3 });
  });
});
