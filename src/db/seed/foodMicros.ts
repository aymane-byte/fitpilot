// Micronutriments des aliments fournis, repris de la table CIQUAL 2020 (ANSES, Licence Ouverte / Etalab).
// Généré par correspondance avec un aliment CIQUAL équivalent (code indiqué). Les plats et pains
// traditionnels (valeurs estimées) n'ont pas de micronutriments : ils restent « inconnus ».
import type { Micros } from '@/lib/micros';

export const SEED_MICROS: Record<string, { ciqual: number } & Micros> = {
  egg: { ciqual: 22000, sugarsG: 0.27, fiberG: 0, saltG: 0.31, satFatG: 2.64, ironMg: 1.88, calciumMg: 76.8, potassiumMg: 134, vitDUg: 1.88, b12Ug: 1.45 },
  egg_boiled: { ciqual: 22010, sugarsG: 0.52, fiberG: 0, saltG: 0.31, satFatG: 2.55, ironMg: 1.72, calciumMg: 41, potassiumMg: 120, vitDUg: 1.12, b12Ug: 1.11 },
  chicken_breast: { ciqual: 36018, sugarsG: 0, fiberG: 0, saltG: 0.14, satFatG: 0.58, ironMg: 0.39, calciumMg: 4.7, potassiumMg: 440, vitDUg: 0.25, b12Ug: 0.18 },
  chicken_thigh: { ciqual: 36031, sugarsG: 0.2, fiberG: 0, saltG: 0.18, satFatG: 2.64, ironMg: 0.96, calciumMg: 15, potassiumMg: 250, vitDUg: 0.25, b12Ug: 0.39 },
  beef_ground: { ciqual: 6255, sugarsG: 0, fiberG: 0, saltG: 0.21, satFatG: 7.08, ironMg: 2.6, calciumMg: 15, potassiumMg: 318, vitDUg: 0, b12Ug: 2.3 },
  sardine_can: { ciqual: 26034, sugarsG: 0, fiberG: 0, saltG: 0.75, satFatG: 2.56, ironMg: 1.97, calciumMg: 333, potassiumMg: 368, vitDUg: 7.56, b12Ug: 13.6 },
  sardine_fresh: { ciqual: 26065, sugarsG: 0, fiberG: 0, saltG: 0.22, satFatG: 2.4, ironMg: 1.67, calciumMg: 57.5, potassiumMg: 584, vitDUg: 14, b12Ug: 8.6 },
  tuna_water: { ciqual: 26039, sugarsG: 0, fiberG: 0, saltG: 0.74, satFatG: 0.09, ironMg: 0.76, calciumMg: 6.26, potassiumMg: 207, vitDUg: 5.08, b12Ug: 2.53 },
  tuna_oil: { ciqual: 26180, fiberG: 0, saltG: 0.93, satFatG: 1.34, ironMg: 0.77, calciumMg: 12, potassiumMg: 220, vitDUg: 0.81, b12Ug: 3.05 },
  rice: { ciqual: 9104, sugarsG: 0.2, fiberG: 0.8, saltG: 0.01, satFatG: 0.08, ironMg: 0.04, calciumMg: 14, potassiumMg: 16, vitDUg: 0, b12Ug: 0.032 },
  potato: { ciqual: 4003, sugarsG: 0.86, fiberG: 1.8, saltG: 0.052, satFatG: 0.09, ironMg: 0.27, calciumMg: 5.83, potassiumMg: 363, vitDUg: 0, b12Ug: 0 },
  lentils: { ciqual: 20587, sugarsG: 0.2, fiberG: 8.45, saltG: 0.015, satFatG: 0.09, ironMg: 2.45, calciumMg: 39.5, potassiumMg: 215, vitDUg: 0.25 },
  white_beans: { ciqual: 20502, sugarsG: 0.3, fiberG: 13.8, saltG: 0.023, satFatG: 0.25, ironMg: 1.7, calciumMg: 120, potassiumMg: 260, vitDUg: 0.25, b12Ug: 0 },
  chickpeas: { ciqual: 20507, sugarsG: 0.3, fiberG: 8.2, saltG: 0.027, satFatG: 0.46, ironMg: 1.3, calciumMg: 72, potassiumMg: 170, vitDUg: 0.25 },
  couscous: { ciqual: 9611, sugarsG: 3, fiberG: 1.9, saltG: 0.013, satFatG: 0.25, ironMg: 1, calciumMg: 13, potassiumMg: 96, vitDUg: 0.25 },
  oats: { ciqual: 9311, sugarsG: 0.97, fiberG: 10.2, saltG: 0.014, satFatG: 1.13, ironMg: 4.05, calciumMg: 84.3, potassiumMg: 377, vitDUg: 0, b12Ug: 0 },
  milk_whole: { ciqual: 19024, fiberG: 0, saltG: 0.2, satFatG: 2.16, ironMg: 0.04, calciumMg: 117, potassiumMg: 140, vitDUg: 0.1, b12Ug: 0.32 },
  milk_semi: { ciqual: 19042, sugarsG: 4.81, fiberG: 0, saltG: 0.078, satFatG: 1.06, ironMg: 0.03, calciumMg: 119, potassiumMg: 153, vitDUg: 0.085, b12Ug: 0.49 },
  yogurt: { ciqual: 19600, sugarsG: 4.67, fiberG: 0.86, saltG: 0.11, satFatG: 1.53, ironMg: 0.2, calciumMg: 127, potassiumMg: 167, vitDUg: 0.61, b12Ug: 0.28 },
  banana: { ciqual: 13005, sugarsG: 15.6, fiberG: 2.7, saltG: 0.013, satFatG: 0.01, ironMg: 0.2, calciumMg: 5.1, potassiumMg: 320, vitDUg: 0, b12Ug: 0 },
  orange: { ciqual: 13034, sugarsG: 7.6, fiberG: 2.7, saltG: 0.013, satFatG: 0.01, ironMg: 0.57, calciumMg: 66, potassiumMg: 180, vitDUg: 0, b12Ug: 0 },
  avocado: { ciqual: 13004, sugarsG: 0.4, fiberG: 3.6, saltG: 0.015, satFatG: 4.51, ironMg: 0.34, calciumMg: 9.4, potassiumMg: 430, vitDUg: 0, b12Ug: 0 },
  tomato: { ciqual: 20047, sugarsG: 2.48, fiberG: 1.2, saltG: 0.008, satFatG: 0.06, ironMg: 0.12, calciumMg: 8.14, potassiumMg: 256, vitDUg: 0, b12Ug: 0 },
  cucumber: { ciqual: 20019, sugarsG: 1.67, fiberG: 0.6, saltG: 0.012, satFatG: 0.04, ironMg: 0.13, calciumMg: 19.2, potassiumMg: 157, vitDUg: 0, b12Ug: 0 },
  onion: { ciqual: 20239, sugarsG: 0.2, fiberG: 2.6, saltG: 0.013, satFatG: 0.01, ironMg: 0.1, calciumMg: 13, potassiumMg: 150 },
  carrot: { ciqual: 20009, sugarsG: 6, fiberG: 2.7, saltG: 0.11, satFatG: 0.01, ironMg: 0.24, calciumMg: 25, potassiumMg: 230, vitDUg: 0, b12Ug: 0 },
  zucchini: { ciqual: 20020, sugarsG: 1.79, fiberG: 1.05, saltG: 0.023, satFatG: 0.06, ironMg: 0.36, calciumMg: 18.7, potassiumMg: 262, vitDUg: 0, b12Ug: 0 },
  eggplant: { ciqual: 20300, sugarsG: 3.4, fiberG: 1.9, saltG: 0.013, satFatG: 0.01, ironMg: 0.59, calciumMg: 13, potassiumMg: 310 },
  olive_oil: { ciqual: 17270, sugarsG: 0, fiberG: 0, saltG: 0.013, satFatG: 15.2, ironMg: 0.05, calciumMg: 0.2, potassiumMg: 0.3, vitDUg: 0.25, b12Ug: 0 },
  olives: { ciqual: 13033, sugarsG: 0, fiberG: 3.6, saltG: 3.15, satFatG: 2.33, ironMg: 0.16, calciumMg: 58, potassiumMg: 31, vitDUg: 0.25, b12Ug: 0 },
  orange_juice: { ciqual: 2070, sugarsG: 9.61, fiberG: 0.28, saltG: 0.012, satFatG: 0.05, ironMg: 0.07, calciumMg: 0.41, potassiumMg: 165, vitDUg: 0, b12Ug: 0 },
};
