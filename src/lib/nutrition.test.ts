import { describe, expect, it } from 'vitest';
import { allergenMatches, lastNDays, macroKcalGap, nutrientsFor, nutritionReport, recipePer100g, sumNutrients } from './nutrition';
import { SEED_FOODS } from '@/db/seed/foods';

const rice = { kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3 };
const oil = { kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 };

describe('portions et totaux', () => {
  it('nutriments pour une portion', () => {
    expect(nutrientsFor(rice, 180)).toEqual({ kcal: 234, proteinG: 4.9, carbsG: 50.8, fatG: 0.5 });
    expect(nutrientsFor(rice, -5).kcal).toBe(0);
  });
  it('somme', () => {
    expect(sumNutrients([nutrientsFor(rice, 100), nutrientsFor(oil, 10)])).toEqual({ kcal: 218, proteinG: 2.7, carbsG: 28.2, fatG: 10.3 });
  });
});

describe('recettes', () => {
  it('valeurs pour 100 g à partir des ingrédients', () => {
    const r = recipePer100g([{ food: rice, grams: 200 }, { food: oil, grams: 20 }]);
    // (260 + 176,8) kcal / 220 g × 100 = 198,5
    expect(r.kcal).toBe(199);
    expect(r.totalG).toBe(220);
  });
  it('poids cuit différent (évaporation)', () => {
    const r = recipePer100g([{ food: rice, grams: 100 }], 50);
    expect(r.kcal).toBe(260);
  });
  it('recette vide', () => expect(recipePer100g([]).kcal).toBe(0));
});

describe('rapport nutrition', () => {
  const day = (date: string, kcal: number, proteinG: number, entries = 3) => ({ date, kcal, proteinG, carbsG: 0, fatG: 0, entries });
  it('moyenne sur les jours renseignés seulement', () => {
    const r = nutritionReport([day('2026-10-26', 2400, 150), day('2026-10-27', 0, 0, 0), day('2026-10-28', 2000, 120)], { kcal: 2440, proteinG: 156 });
    expect(r.daysLogged).toBe(2);
    expect(r.avg.kcal).toBe(2200);
    expect(r.daysOnTarget).toBe(1); // 2400 dans ±10 %, 2000 non
    expect(r.daysProteinOk).toBe(1); // 150 ≥ 140,4
  });
  it('aucun jour → moyennes à 0', () => {
    expect(nutritionReport([], { kcal: 2000, proteinG: 100 }).avg.kcal).toBe(0);
  });
  it('7 derniers jours', () => {
    expect(lastNDays('2026-10-30', 7)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  });
});

describe('allergies', () => {
  it('reconnaît les allergies en texte libre (sans accents)', () => {
    expect(allergenMatches('Allergie aux arachides', ['peanut'])).toEqual(['peanut']);
    expect(allergenMatches('intolérance au LACTOSE', ['lactose', 'gluten'])).toEqual(['lactose']);
    expect(allergenMatches('oeufs', ['egg'])).toEqual(['egg']);
    expect(allergenMatches('', ['egg'])).toEqual([]);
  });
  it('pas de faux positif sur un mot partiel', () => {
    expect(allergenMatches('blettes', ['gluten'])).toEqual([]); // « ble » ne doit pas matcher « blettes »
  });
});

describe('base d’aliments', () => {
  it('contient tous les aliments marocains demandés', () => {
    const keys = new Set(SEED_FOODS.map((f) => f.key));
    for (const k of ['egg', 'chicken_breast', 'sardine_can', 'tuna_water', 'rice', 'potato', 'lentils', 'white_beans', 'chickpeas', 'couscous', 'khobz', 'msemen', 'harcha', 'olive_oil', 'milk_whole', 'raib', 'yogurt', 'lben', 'banana', 'apple', 'orange', 'dates', 'almonds', 'peanuts', 'amlou', 'tajine_chicken', 'tajine_kefta', 'couscous_veg', 'harira', 'bissara', 'rfissa', 'zaalouk', 'loubia_dish'])
      expect(keys.has(k), k).toBe(true);
  });
  it('clés uniques, unités présentes, calories cohérentes avec les macros (±12 %)', () => {
    expect(new Set(SEED_FOODS.map((f) => f.key)).size).toBe(SEED_FOODS.length);
    for (const f of SEED_FOODS) {
      expect(f.units.length, f.key).toBeGreaterThan(0);
      // Légumes très peu caloriques : les fibres comptées dans les glucides faussent le 4-4-9 (données USDA réelles).
      if (f.kcal >= 50) expect(macroKcalGap(f), f.key).toBeLessThan(0.12);
    }
  });
  it('les plats traditionnels sont marqués comme estimés', () => {
    for (const f of SEED_FOODS.filter((x) => x.category === 'dish')) expect(f.estimated, f.key).toBe(true);
  });
});

describe('recherche', () => {
  it('« oeuf » trouve « Œuf », accents ignorés', async () => {
    const { normalizeText } = await import('./text');
    expect(normalizeText('Œuf entier')).toBe('oeuf entier');
    expect(normalizeText('Cacahuètes')).toBe('cacahuetes');
  });
});
