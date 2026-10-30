// Table CIQUAL 2020 (ANSES, Licence Ouverte / Etalab) : ~2 300 aliments génériques avec
// valeurs pour 100 g. Fichier statique chargé à la demande (mis en cache pour le hors-ligne).
// Un aliment CIQUAL n'est copié dans la base locale que lorsqu'il est utilisé : les aliments
// marocains et ceux que tu as modifiés restent prioritaires dans la recherche.
import type { Micros } from './micros';
import { normalizeText } from './text';

export interface CiqualFile {
  source: string;
  fields: string[];
  groups: Record<string, string>;
  /** [code, nom, groupe, kcal, protéines, glucides, lipides, sucres, fibres, sel, AGS, fer, calcium, potassium, vit D, B12] */
  foods: (string | number | null)[][];
}

export interface CiqualFood extends Micros {
  code: number;
  name: string;
  group: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const n0 = (v: unknown) => (typeof v === 'number' ? v : 0);
const opt = (v: unknown) => (typeof v === 'number' ? v : undefined);

export function ciqualRows(file: CiqualFile): CiqualFood[] {
  return file.foods.map((r) => {
    const f: CiqualFood = { code: r[0] as number, name: r[1] as string, group: r[2] as string, kcal: Math.round(n0(r[3])), proteinG: n0(r[4]), carbsG: n0(r[5]), fatG: n0(r[6]) };
    const micro: [keyof Micros, unknown][] = [['sugarsG', r[7]], ['fiberG', r[8]], ['saltG', r[9]], ['satFatG', r[10]], ['ironMg', r[11]], ['calciumMg', r[12]], ['potassiumMg', r[13]], ['vitDUg', r[14]], ['b12Ug', r[15]]];
    for (const [k, v] of micro) if (opt(v) !== undefined) f[k] = v as number;
    return f;
  });
}

/** Groupe CIQUAL → catégorie de l'app (pour les filtres). */
export function ciqualCategory(f: Pick<CiqualFood, 'group' | 'name'>): string {
  const name = normalizeText(f.name);
  switch (f.group) {
    case '01':
      return 'dish';
    case '02':
      if (/^(lentille|haricot|pois chiche|feve|pois casse|soja)/.test(name)) return 'starch';
      if (/^(amande|noix|noisette|pistache|cacahuete|arachide|graine|sesame|cajou)/.test(name)) return 'nuts';
      return /fruit|pomme|banane|orange|datte|figue|raisin|fraise|melon|pasteque|abricot|peche|poire|mangue|ananas|kiwi|citron|grenade|cerise|prune/.test(name) ? 'fruit' : 'veg';
    case '03':
      return /^pain|biscotte|galette|crepe/.test(name) ? 'bread' : 'starch';
    case '04':
      return 'protein';
    case '05':
      return 'dairy';
    case '06':
      return 'drink';
    case '07':
    case '08':
      return 'sweet';
    case '09':
      return 'fat';
    default:
      return 'dish';
  }
}

export interface CiqualIndex {
  foods: CiqualFood[];
  keys: string[];
}

export function buildIndex(foods: CiqualFood[]): CiqualIndex {
  return { foods, keys: foods.map((f) => normalizeText(f.name)) };
}

/**
 * Recherche : tous les mots de la requête doivent apparaître (sans accents, sans casse).
 * Classement : nom qui commence par la requête, puis mot entier, puis nom le plus court.
 */
export function searchCiqual(index: CiqualIndex, query: string, limit = 30): CiqualFood[] {
  const q = normalizeText(query).trim();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits: { f: CiqualFood; score: number }[] = [];
  index.keys.forEach((key, i) => {
    if (!words.every((w) => key.includes(w))) return;
    let score = key.length / 100;
    if (key.startsWith(q)) score -= 10;
    else if (key.startsWith(words[0])) score -= 6;
    if (new RegExp(`(^|[^a-z])${words[0]}([^a-z]|$)`).test(key)) score -= 3;
    hits.push({ f: index.foods[i], score });
  });
  return hits
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((h) => h.f);
}

export const ciqualKey = (code: number) => `ciqual:${code}`;
