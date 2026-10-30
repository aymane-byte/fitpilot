// Open Food Facts (base collaborative, licence ODbL) : recherche d'un produit par code-barres.
// API publique sans clé, CORS autorisé. Les produits trouvés sont gardés dans la base locale
// pour fonctionner hors-ligne ensuite.
import type { Micros } from './micros';

export const OFF_FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,quantity,serving_quantity,serving_size,nutriments,allergens_tags,nutriscore_grade';

export function offProductUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
}

/** Vérifie la clé de contrôle d'un EAN-8, UPC-A (12) ou EAN-13. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export interface OffFood extends Micros {
  barcode: string;
  name: string;
  brand?: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Portion indiquée sur l'emballage (g), si disponible. */
  servingG?: number;
  allergens: string[];
  nutriscore?: string;
}

const ALLERGEN_MAP: Record<string, string> = {
  'en:gluten': 'gluten',
  'en:milk': 'lactose',
  'en:eggs': 'egg',
  'en:peanuts': 'peanut',
  'en:nuts': 'nuts',
  'en:fish': 'fish',
  'en:sesame-seeds': 'sesame',
};

type Nutriments = Record<string, number | string | undefined>;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const r = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Convertit la réponse de l'API en aliment (valeurs pour 100 g). null si produit inconnu
 * ou sans valeurs nutritionnelles exploitables (calories manquantes).
 */
export function parseOffProduct(json: unknown, code: string): OffFood | null {
  const j = json as { status?: number; product?: { product_name?: string; product_name_fr?: string; generic_name_fr?: string; brands?: string; serving_quantity?: number | string; nutriments?: Nutriments; allergens_tags?: string[]; nutriscore_grade?: string } };
  if (!j || j.status === 0 || !j.product) return null;
  const p = j.product;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === undefined && num(n['energy_100g']) !== undefined) kcal = num(n['energy_100g'])! / 4.184; // kJ → kcal
  if (kcal === undefined) return null;
  const name = (p.product_name_fr || p.product_name || p.generic_name_fr || '').trim();
  const salt = num(n['salt_100g']) ?? (num(n['sodium_100g']) !== undefined ? num(n['sodium_100g'])! * 2.5 : undefined);
  const mg = (k: string) => (num(n[k]) !== undefined ? r(num(n[k])! * 1000, 1) : undefined); // g → mg
  const ug = (k: string) => (num(n[k]) !== undefined ? r(num(n[k])! * 1_000_000, 2) : undefined); // g → µg
  const out: OffFood = {
    barcode: code,
    name: name || `Produit ${code}`,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    kcal: Math.round(kcal),
    proteinG: r(num(n['proteins_100g']) ?? 0),
    carbsG: r(num(n['carbohydrates_100g']) ?? 0),
    fatG: r(num(n['fat_100g']) ?? 0),
    servingG: num(p.serving_quantity) && num(p.serving_quantity)! <= 2000 ? r(num(p.serving_quantity)!, 0) : undefined,
    allergens: [...new Set((p.allergens_tags ?? []).map((a) => ALLERGEN_MAP[a]).filter(Boolean))],
    nutriscore: p.nutriscore_grade && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade.toUpperCase() : undefined,
  };
  const set = (k: keyof Micros, v: number | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set('fiberG', num(n['fiber_100g']) !== undefined ? r(num(n['fiber_100g'])!) : undefined);
  set('sugarsG', num(n['sugars_100g']) !== undefined ? r(num(n['sugars_100g'])!) : undefined);
  set('saltG', salt !== undefined ? r(salt, 2) : undefined);
  set('satFatG', num(n['saturated-fat_100g']) !== undefined ? r(num(n['saturated-fat_100g'])!) : undefined);
  set('ironMg', mg('iron_100g'));
  set('calciumMg', mg('calcium_100g'));
  set('potassiumMg', mg('potassium_100g'));
  set('vitDUg', ug('vitamin-d_100g'));
  set('b12Ug', ug('vitamin-b12_100g'));
  return out;
}
