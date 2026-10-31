// Aliments de base, valeurs pour 100 g (arrondies).
// Sources : USDA FoodData Central (SR Legacy) et CIQUAL (ANSES) pour les produits simples.
// Les plats et pains traditionnels varient selon les familles : marqués `estimated: true`,
// valeurs calculées à partir de recettes types. Tout est modifiable dans l'app.

export interface SeedFood {
  key: string;
  name: string;
  category: 'protein' | 'starch' | 'bread' | 'dairy' | 'fruit' | 'veg' | 'fat' | 'nuts' | 'dish' | 'drink' | 'sweet';
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  estimated: boolean;
  source: string;
  units: { label: string; grams: number }[];
  allergens?: string[];
}

const usda = 'USDA FoodData Central';
const est = 'Estimation (recette type)';
const u = (label: string, grams: number) => ({ label, grams });

export const SEED_FOODS: SeedFood[] = [
  // Protéines
  { key: 'egg', name: 'Œuf entier', category: 'protein', kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5, estimated: false, source: usda, units: [u('pièce', 50)], allergens: ['egg'] },
  { key: 'egg_boiled', name: 'Œuf dur', category: 'protein', kcal: 155, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, estimated: false, source: usda, units: [u('pièce', 50)], allergens: ['egg'] },
  { key: 'chicken_breast', name: 'Blanc de poulet cuit', category: 'protein', kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, estimated: false, source: usda, units: [u('filet', 150)] },
  { key: 'chicken_thigh', name: 'Cuisse de poulet cuite (sans peau)', category: 'protein', kcal: 209, proteinG: 25.9, carbsG: 0, fatG: 10.9, estimated: false, source: usda, units: [u('cuisse', 110)] },
  { key: 'beef_ground', name: 'Viande hachée 15 % MG cuite (kefta)', category: 'protein', kcal: 250, proteinG: 25.9, carbsG: 0, fatG: 15.4, estimated: false, source: usda, units: [u('boulette', 30)] },
  { key: 'sardine_can', name: 'Sardines à l’huile (égouttées)', category: 'protein', kcal: 208, proteinG: 24.6, carbsG: 0, fatG: 11.5, estimated: false, source: usda, units: [u('boîte', 85), u('sardine', 24)], allergens: ['fish'] },
  { key: 'sardine_fresh', name: 'Sardines fraîches grillées', category: 'protein', kcal: 190, proteinG: 24, carbsG: 0, fatG: 10.5, estimated: true, source: est, units: [u('sardine', 40)], allergens: ['fish'] },
  { key: 'tuna_water', name: 'Thon au naturel (égoutté)', category: 'protein', kcal: 116, proteinG: 25.5, carbsG: 0, fatG: 0.8, estimated: false, source: usda, units: [u('boîte', 100)], allergens: ['fish'] },
  { key: 'tuna_oil', name: 'Thon à l’huile (égoutté)', category: 'protein', kcal: 198, proteinG: 29.1, carbsG: 0, fatG: 8.2, estimated: false, source: usda, units: [u('boîte', 100)], allergens: ['fish'] },

  // Féculents et légumineuses
  { key: 'rice', name: 'Riz blanc cuit', category: 'starch', kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, estimated: false, source: usda, units: [u('bol', 180), u('cuillère à soupe', 15)] },
  { key: 'potato', name: 'Pommes de terre bouillies', category: 'starch', kcal: 86, proteinG: 1.7, carbsG: 20, fatG: 0.1, estimated: false, source: usda, units: [u('pièce moyenne', 150)] },
  { key: 'lentils', name: 'Lentilles cuites (3dess)', category: 'starch', kcal: 116, proteinG: 9, carbsG: 20.1, fatG: 0.4, estimated: false, source: usda, units: [u('bol', 200)] },
  { key: 'white_beans', name: 'Haricots blancs cuits (loubia)', category: 'starch', kcal: 140, proteinG: 8.2, carbsG: 26, fatG: 0.6, estimated: false, source: usda, units: [u('bol', 200)] },
  { key: 'chickpeas', name: 'Pois chiches cuits', category: 'starch', kcal: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6, estimated: false, source: usda, units: [u('bol', 160), u('cuillère à soupe', 15)] },
  { key: 'couscous', name: 'Couscous (semoule) cuit', category: 'starch', kcal: 112, proteinG: 3.8, carbsG: 23.2, fatG: 0.2, estimated: false, source: usda, units: [u('assiette', 250), u('bol', 160)], allergens: ['gluten'] },
  { key: 'pasta', name: 'Pâtes cuites', category: 'starch', kcal: 158, proteinG: 5.8, carbsG: 30.9, fatG: 0.9, estimated: false, source: usda, units: [u('assiette', 220)], allergens: ['gluten'] },
  { key: 'oats', name: 'Flocons d’avoine', category: 'starch', kcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9, estimated: false, source: usda, units: [u('cuillère à soupe', 10), u('bol', 40)], allergens: ['gluten'] },
  { key: 'peas', name: 'Petits pois cuits', category: 'veg', kcal: 84, proteinG: 5.4, carbsG: 15.6, fatG: 0.2, estimated: false, source: usda, units: [u('bol', 160)] },

  // Pains
  { key: 'khobz', name: 'Khobz (pain marocain)', category: 'bread', kcal: 265, proteinG: 8, carbsG: 51, fatG: 3, estimated: true, source: 'Estimation (proche du pain blanc, USDA)', units: [u('tranche de khobz', 40), u('quart de khobz', 90), u('khobz entier', 360)], allergens: ['gluten'] },
  { key: 'msemen', name: 'Msemen', category: 'bread', kcal: 334, proteinG: 7, carbsG: 45, fatG: 14, estimated: true, source: est, units: [u('pièce', 80)], allergens: ['gluten'] },
  { key: 'harcha', name: 'Harcha', category: 'bread', kcal: 371, proteinG: 7, carbsG: 52, fatG: 15, estimated: true, source: est, units: [u('pièce', 70)], allergens: ['gluten', 'lactose'] },
  { key: 'baghrir', name: 'Baghrir', category: 'bread', kcal: 190, proteinG: 5, carbsG: 38, fatG: 2, estimated: true, source: est, units: [u('pièce', 60)], allergens: ['gluten'] },

  // Produits laitiers
  { key: 'milk_whole', name: 'Lait entier', category: 'dairy', kcal: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, estimated: false, source: usda, units: [u('verre', 250)], allergens: ['lactose'] },
  { key: 'milk_semi', name: 'Lait demi-écrémé', category: 'dairy', kcal: 46, proteinG: 3.3, carbsG: 4.8, fatG: 1.6, estimated: false, source: 'CIQUAL', units: [u('verre', 250)], allergens: ['lactose'] },
  { key: 'yogurt', name: 'Yaourt nature', category: 'dairy', kcal: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3, estimated: false, source: usda, units: [u('pot', 110)], allergens: ['lactose'] },
  { key: 'greek_yogurt', name: 'Yaourt grec 0 %', category: 'dairy', kcal: 59, proteinG: 10.2, carbsG: 3.6, fatG: 0.4, estimated: false, source: usda, units: [u('pot', 150)], allergens: ['lactose'] },
  { key: 'raib', name: 'Raïb (sucré)', category: 'dairy', kcal: 90, proteinG: 3.3, carbsG: 13, fatG: 2.8, estimated: true, source: est, units: [u('pot', 110)], allergens: ['lactose'] },
  { key: 'lben', name: 'Lben', category: 'dairy', kcal: 40, proteinG: 3.3, carbsG: 4.8, fatG: 0.9, estimated: true, source: 'Estimation (proche du babeurre, USDA)', units: [u('verre', 250)], allergens: ['lactose'] },

  // Fruits
  { key: 'banana', name: 'Banane', category: 'fruit', kcal: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3, estimated: false, source: usda, units: [u('pièce', 120)] },
  { key: 'apple', name: 'Pomme', category: 'fruit', kcal: 52, proteinG: 0.3, carbsG: 13.8, fatG: 0.2, estimated: false, source: usda, units: [u('pièce', 150)] },
  { key: 'orange', name: 'Orange', category: 'fruit', kcal: 47, proteinG: 0.9, carbsG: 11.8, fatG: 0.1, estimated: false, source: usda, units: [u('pièce', 150)] },
  { key: 'dates', name: 'Dattes', category: 'fruit', kcal: 282, proteinG: 2.5, carbsG: 75, fatG: 0.4, estimated: false, source: usda, units: [u('datte', 8)] },
  { key: 'avocado', name: 'Avocat', category: 'fruit', kcal: 160, proteinG: 2, carbsG: 8.5, fatG: 14.7, estimated: false, source: usda, units: [u('demi', 75)] },

  // Légumes
  { key: 'tomato', name: 'Tomate', category: 'veg', kcal: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, estimated: false, source: usda, units: [u('pièce', 120)] },
  { key: 'cucumber', name: 'Concombre', category: 'veg', kcal: 15, proteinG: 0.7, carbsG: 3.6, fatG: 0.1, estimated: false, source: usda, units: [u('pièce', 200)] },
  { key: 'onion', name: 'Oignon', category: 'veg', kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1, estimated: false, source: usda, units: [u('pièce', 110)] },
  { key: 'carrot', name: 'Carotte', category: 'veg', kcal: 41, proteinG: 0.9, carbsG: 9.6, fatG: 0.2, estimated: false, source: usda, units: [u('pièce', 60)] },
  { key: 'zucchini', name: 'Courgette', category: 'veg', kcal: 17, proteinG: 1.2, carbsG: 3.1, fatG: 0.3, estimated: false, source: usda, units: [u('pièce', 200)] },
  { key: 'eggplant', name: 'Aubergine', category: 'veg', kcal: 25, proteinG: 1, carbsG: 5.9, fatG: 0.2, estimated: false, source: usda, units: [u('pièce', 450)] },

  // Matières grasses, fruits à coque
  { key: 'olive_oil', name: 'Huile d’olive', category: 'fat', kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, estimated: false, source: usda, units: [u('cuillère à soupe', 13.5), u('cuillère à café', 4.5)] },
  { key: 'olives', name: 'Olives vertes', category: 'fat', kcal: 145, proteinG: 1, carbsG: 3.8, fatG: 15.3, estimated: false, source: usda, units: [u('olive', 4)] },
  { key: 'almonds', name: 'Amandes', category: 'nuts', kcal: 579, proteinG: 21.2, carbsG: 21.6, fatG: 49.9, estimated: false, source: usda, units: [u('poignée', 25), u('amande', 1.2)], allergens: ['nuts'] },
  { key: 'peanuts', name: 'Cacahuètes', category: 'nuts', kcal: 567, proteinG: 25.8, carbsG: 16.1, fatG: 49.2, estimated: false, source: usda, units: [u('poignée', 25)], allergens: ['peanut'] },
  { key: 'amlou', name: 'Amlou', category: 'nuts', kcal: 615, proteinG: 11, carbsG: 27, fatG: 55, estimated: true, source: 'Estimation (amandes, huile d’argan, miel)', units: [u('cuillère à soupe', 20)], allergens: ['nuts'] },

  // Sucres et boissons
  { key: 'honey', name: 'Miel', category: 'sweet', kcal: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0, estimated: false, source: usda, units: [u('cuillère à soupe', 21), u('cuillère à café', 7)] },
  { key: 'sugar', name: 'Sucre', category: 'sweet', kcal: 387, proteinG: 0, carbsG: 100, fatG: 0, estimated: false, source: usda, units: [u('morceau', 5), u('cuillère à café', 4)] },
  { key: 'mint_tea_plain', name: 'Thé à la menthe sans sucre', category: 'drink', kcal: 1, proteinG: 0, carbsG: 0.2, fatG: 0, estimated: false, source: 'CIQUAL (thé infusé, non sucré)', units: [u('verre', 120), u('théière', 600)] },
  { key: 'mint_tea_light', name: 'Thé à la menthe peu sucré', category: 'drink', kcal: 20, proteinG: 0, carbsG: 5, fatG: 0, estimated: true, source: 'Estimation (~5 g de sucre par 100 ml)', units: [u('verre', 120), u('théière', 600)] },
  { key: 'coffee_black', name: 'Café noir sans sucre', category: 'drink', kcal: 2, proteinG: 0.1, carbsG: 0, fatG: 0, estimated: false, source: 'CIQUAL (café non sucré)', units: [u('tasse', 100), u('expresso', 40)] },
  { key: 'mint_tea', name: 'Thé à la menthe sucré', category: 'drink', kcal: 40, proteinG: 0, carbsG: 10, fatG: 0, estimated: true, source: 'Estimation (~10 g de sucre par 100 ml)', units: [u('verre', 120), u('théière', 600)] },
  { key: 'orange_juice', name: 'Jus d’orange', category: 'drink', kcal: 45, proteinG: 0.7, carbsG: 10.4, fatG: 0.2, estimated: false, source: usda, units: [u('verre', 250)] },

  // Plats traditionnels (valeurs estimées : la recette varie)
  { key: 'tajine_chicken', name: 'Tajine de poulet aux légumes', category: 'dish', kcal: 127, proteinG: 11, carbsG: 5, fatG: 7, estimated: true, source: est, units: [u('assiette', 300)] },
  { key: 'tajine_kefta', name: 'Tajine de kefta (tomate, œufs)', category: 'dish', kcal: 190, proteinG: 12, carbsG: 4, fatG: 14, estimated: true, source: est, units: [u('assiette', 300)], allergens: ['egg'] },
  { key: 'couscous_veg', name: 'Couscous aux légumes (avec viande)', category: 'dish', kcal: 140, proteinG: 6, carbsG: 20, fatG: 4, estimated: true, source: est, units: [u('assiette', 400)], allergens: ['gluten'] },
  { key: 'harira', name: 'Harira', category: 'dish', kcal: 65, proteinG: 3.5, carbsG: 9.5, fatG: 1.5, estimated: true, source: est, units: [u('bol', 300)], allergens: ['gluten'] },
  { key: 'bissara', name: 'Bissara', category: 'dish', kcal: 116, proteinG: 6, carbsG: 14, fatG: 4, estimated: true, source: est, units: [u('bol', 300)] },
  { key: 'rfissa', name: 'Rfissa', category: 'dish', kcal: 176, proteinG: 9, carbsG: 17, fatG: 8, estimated: true, source: est, units: [u('assiette', 350)], allergens: ['gluten'] },
  { key: 'zaalouk', name: 'Zaalouk', category: 'dish', kcal: 87, proteinG: 1.3, carbsG: 7, fatG: 6, estimated: true, source: est, units: [u('bol', 150), u('cuillère à soupe', 20)] },
  { key: 'loubia_dish', name: 'Loubia (plat de haricots blancs)', category: 'dish', kcal: 120, proteinG: 6, carbsG: 15, fatG: 4, estimated: true, source: est, units: [u('bol', 300)] },
  { key: 'adass_dish', name: '3dess (plat de lentilles)', category: 'dish', kcal: 117, proteinG: 6.5, carbsG: 16, fatG: 3, estimated: true, source: est, units: [u('bol', 300)] },
];
