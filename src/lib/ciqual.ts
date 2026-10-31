// Table CIQUAL 2020 (ANSES, Licence Ouverte / Etalab) : ~2 300 aliments génériques avec
// valeurs pour 100 g. Fichier statique chargé à la demande (mis en cache pour le hors-ligne).
// Un aliment CIQUAL n'est copié dans la base locale que lorsqu'il est utilisé : les aliments
// marocains et ceux que tu as modifiés restent prioritaires dans la recherche.
import type { Micros } from './micros';
import { normalizeText } from './text';
import { matchFood, tokens } from './search';

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
  /** Mots (normalisés, racines) de chaque nom, calculés une fois. */
  toks: string[][];
}

export function buildIndex(foods: CiqualFood[]): CiqualIndex {
  return { foods, toks: foods.map((f) => tokens(f.name)) };
}

/**
 * Recherche par mots (ordre libre, sans accents, « sans » = « non », début de mot suffisant).
 * Les correspondances complètes passent avant les approchées, puis les noms les plus courts.
 */
export function searchCiqual(index: CiqualIndex, query: string, limit = 30): CiqualFood[] {
  if (normalizeText(query).trim().length < 2) return [];
  const hits: { f: CiqualFood; score: number }[] = [];
  index.toks.forEach((t, i) => {
    const m = matchFood(query, index.foods[i].name, t);
    if (m) hits.push({ f: index.foods[i], score: m.score });
  });
  return hits
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((h) => h.f);
}

export const ciqualKey = (code: number) => `ciqual:${code}`;
