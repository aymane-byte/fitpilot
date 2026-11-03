// Questions sur un aliment (« je peux manger des dattes ? », « wach nakol l3dess ? combien ? ») :
// repérer l'aliment cité, puis répondre à partir de ses valeurs réelles et des objectifs du profil :
// convient-il à l'objectif, comment le manger, quelle quantité.
import { tokens } from '../search';
import type { Goal } from '../energy';
import type { Micros } from '../micros';

export interface FoodInfo extends Micros {
  name: string;
  category?: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  units?: { label: string; grams: number }[];
  estimated?: boolean;
}

/** Mots trop génériques pour identifier un aliment à eux seuls. */
const GENERIC = new Set(['cuit', 'cru', 'nature', 'entier', 'maison', 'sucr', 'non', 'frai', 'sec', 'boui', 'pulp', 'peau', 'eau', 'moyen', 'aliment', 'plat', 'type', 'petit', 'grand', 'bio', 'protein', 'proteine', 'repa', 'jour', 'kcal', 'calori']);

/** Mots (français / darija) d'une question sur un aliment. */
export const FOOD_QUESTION = /(manger|mange|nakol|nakolha|nakolhom|nakloh|kol |kla|wach|est-ce que|est ce que|combien|quantit|portion|chhal|ch7al|kifach|comment|bon pour|bonne pour|grossi|maigri|consomm|prendre|ok pour|autoris|interdit|eviter|éviter|ndir|n9dar|nqder)/i;

/**
 * Aliment cité dans un message : le nom dont les mots distinctifs apparaissent dans le message
 * (début de mot suffisant, sans accents). Le plus de mots communs l'emporte, puis le nom le plus court.
 */
export function findFoodInMessage<T extends { name: string }>(message: string, foods: T[]): T | null {
  const msg = tokens(message);
  if (!msg.length) return null;
  const has = (w: string) => msg.some((m) => m.length >= 3 && (m.startsWith(w) || w.startsWith(m)));
  let best: { f: T; score: number } | null = null;
  for (const f of foods) {
    const words = tokens(f.name).filter((w) => w.length >= 3 && !GENERIC.has(w));
    if (!words.length || !has(words[0])) continue;
    const hits = words.filter(has).length;
    const score = hits * 10 - words.length - f.name.length / 100;
    if (!best || score > best.score) best = { f, score };
  }
  return best?.f ?? null;
}

export interface AdviceTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const r = (n: number, step = 5) => Math.max(step, Math.round(n / step) * step);

/** Portion conseillée (g) selon le profil nutritionnel de l'aliment et les objectifs du jour. */
export function suggestedPortion(f: FoodInfo, t: AdviceTargets, goal: Goal = 'recomp'): { grams: number; basis: 'protein' | 'carbs' | 'fat' | 'veg' | 'drink' | 'kcal' } {
  const perMeal = t.calories / 4;
  if (f.category === 'drink') return { grams: 250, basis: 'drink' };
  if (f.kcal <= 45 && f.category !== 'dairy') return { grams: 250, basis: 'veg' };
  const pShare = (f.proteinG * 4) / Math.max(1, f.kcal);
  const cShare = (f.carbsG * 4) / Math.max(1, f.kcal);
  const fShare = (f.fatG * 9) / Math.max(1, f.kcal);
  // Riche en protéines : de quoi apporter ~1/4 des protéines du jour.
  if (pShare >= 0.3) return { grams: r(Math.min(((t.proteinG / 4) * 100) / Math.max(1, f.proteinG), (perMeal * 0.6 * 100) / f.kcal)), basis: 'protein' };
  // Très sucré et peu de fibres (dattes, miel, gâteaux, jus) : ~100 kcal (150 hors perte de poids).
  if ((f.sugarsG ?? 0) >= 15 && (f.fiberG ?? 0) < 3 && f.category !== 'drink') return { grams: r(((goal === 'fat_loss' || goal === 'recomp' ? 100 : 150) * 100) / f.kcal), basis: 'carbs' };
  // Très gras (huile, amlou, fruits à coque) : ~120 kcal.
  if (fShare >= 0.6) return { grams: r((120 * 100) / f.kcal, f.kcal > 600 ? 5 : 10), basis: 'fat' };
  // Féculents, pains, fruits : ~1/4 des glucides du jour, sans dépasser ~45 % du repas.
  if (cShare >= 0.5) return { grams: r(Math.min(((t.carbsG / 4) * 100) / Math.max(1, f.carbsG), (perMeal * 0.45 * 100) / f.kcal)), basis: 'carbs' };
  return { grams: r((perMeal * 0.4 * 100) / f.kcal), basis: 'kcal' };
}

/** Portion exprimée en unité maison si possible (« ≈ 1 bol », « ≈ 2 pièces »). */
export function portionInUnits(f: FoodInfo, grams: number): string | null {
  const u = f.units?.find((x) => x.grams > 0 && grams / x.grams >= 0.4 && grams / x.grams <= 6);
  if (!u) return null;
  const q = Math.round((grams / u.grams) * 2) / 2;
  return `${String(q).replace('.', ',')} × ${u.label}`;
}

export function foodAdvice(f: FoodInfo, t: AdviceTargets, goal: Goal, opts: { ramadan?: boolean } = {}): string {
  const lines: string[] = [];
  const per = `${Math.round(f.kcal)} kcal, ${round1(f.proteinG)} g de protéines, ${round1(f.carbsG)} g de glucides, ${round1(f.fatG)} g de lipides pour 100 g`;
  lines.push(`${f.name} : ${per}${f.estimated ? ' (valeurs estimées)' : ''}.`);
  const sugar = f.sugarsG ?? 0;
  const fiber = f.fiberG;
  const losing = goal === 'fat_loss' || goal === 'recomp';
  const verdict: string[] = [];
  if ((f.proteinG * 4) / Math.max(1, f.kcal) >= 0.3) verdict.push('Très bonne source de protéines : parfait pour ton objectif, à chaque repas si tu veux.');
  if (f.kcal <= 45 && f.category !== 'drink') verdict.push('Très peu calorique : à volonté, il remplit l’assiette sans peser sur tes calories.');
  if (fiber !== undefined && fiber >= 6) verdict.push('Riche en fibres : rassasiant, bon pour la digestion.');
  if (sugar >= 15 && (fiber ?? 0) < 3) verdict.push(losing ? 'Riche en sucres : pas interdit, mais en petite quantité, de préférence autour de l’entraînement.' : 'Riche en sucres : idéal avant ou après l’entraînement, moins le soir.');
  if (f.kcal >= 450) verdict.push(losing ? 'Très calorique : garde des petites portions et compte-le bien.' : 'Très calorique : pratique pour augmenter tes calories facilement.');
  if ((f.saltG ?? 0) >= 1.5) verdict.push('Assez salé : modère les quantités et évite d’en manger tous les jours.');
  if (!verdict.length) verdict.push(losing ? 'Compatible avec ton objectif si la quantité reste raisonnable.' : 'Compatible avec ton objectif.');
  lines.push(verdict.join(' '));
  const p = suggestedPortion(f, t, goal);
  const units = portionInUnits(f, p.grams);
  const kcal = Math.round((f.kcal * p.grams) / 100);
  const prot = round1((f.proteinG * p.grams) / 100);
  lines.push(`Quantité conseillée : environ ${p.grams} g${units ? ` (≈ ${units})` : ''} par repas, soit ~${kcal} kcal et ${prot} g de protéines (objectif du jour : ${t.calories} kcal, ${t.proteinG} g de protéines).`);
  const how: Record<typeof p.basis, string> = {
    protein: 'Répartis tes protéines sur 3–4 repas ; accompagne de légumes et d’un féculent.',
    carbs: 'Plutôt au repas avant ou après l’entraînement ; associe une source de protéines (œufs, poulet, lben…) et des légumes.',
    fat: 'En petite quantité (une cuillère, une poignée) : avec du pain complet ou en collation, pas en plus d’un repas déjà gras.',
    veg: 'Ajoute-le à chaque repas (tajine, salade, soupe) pour plus de volume et de fibres.',
    drink: 'Préfère la version sans sucre ; avec du sucre, compte-le dans tes calories.',
    kcal: 'Intègre-le dans un repas équilibré : moitié légumes, un quart protéines, un quart féculents.',
  };
  lines.push(`Comment le manger : ${how[p.basis]}`);
  if (opts.ramadan) lines.push('Pendant le Ramadan : plutôt au ftour ou au s’hour, avec beaucoup d’eau entre les deux.');
  return lines.join('\n');
}

const round1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
