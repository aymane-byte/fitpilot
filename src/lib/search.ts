// Recherche d'aliments par mots : ordre libre, sans accents, pluriels et petits mots ignorés,
// début de mot suffisant (« lent » trouve « lentilles »), « sans » = « non » (« thé sans sucre »
// trouve « Thé infusé, non sucré »). Les noms qui contiennent presque tous les mots sont
// proposés ensuite comme résultats approchés.
import { normalizeText } from './text';

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'en', 'avec', 'un', 'une', 'pour', 'ou', 'sur', 'par']);
const SYNONYMS: Record<string, string> = { sans: 'non', zero: 'non', light: 'allege', yogourt: 'yaourt', yoghourt: 'yaourt', tea: 'the', coffee: 'cafe' };

/** Racine simple : pluriel (s, x) et « e » final retirés (« sucrée » → « sucr », « sucré » → « sucr »). */
export function stem(word: string): string {
  let w = word;
  if (w.length > 3 && /[sx]$/.test(w)) w = w.slice(0, -1);
  // « sucrée » → « sucr », « sucré » → « sucr » (féminin : deux « e » après normalisation).
  for (let k = 0; k < 2 && w.length > 3 && w.endsWith('e'); k++) w = w.slice(0, -1);
  return w;
}

/** Mots normalisés : même traitement pour la requête et les noms (« sans » = « non » des deux côtés). */
export function tokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? w)
    .map(stem);
}

export interface Match {
  /** Nombre de mots de la requête retrouvés dans le nom. */
  matched: number;
  total: number;
  score: number;
}

/** null si le nom ne correspond pas assez à la requête. Score : plus petit = meilleur. */
export function matchFood(query: string, name: string, nameTokens = tokens(name)): Match | null {
  const q = tokens(query);
  if (!q.length) return null;
  // La négation doit correspondre : « sans sucre » ne trouve pas « sucré », « sucré » ne trouve pas « non sucré ».
  const negated = (list: string[], i: number) => i > 0 && list[i - 1] === 'non';
  let matched = 0;
  let firstWord = false;
  for (const [qi, qt] of q.entries()) {
    if (qt === 'non') {
      if (!nameTokens.includes('non')) return null;
      matched++;
      continue;
    }
    const i = nameTokens.findIndex((nt) => nt.startsWith(qt) || (qt.length >= 4 && qt.startsWith(nt) && nt.length >= 3));
    if (i >= 0 && negated(nameTokens, i) !== negated(q, qi)) return null;
    if (i >= 0) {
      matched++;
      if (i === 0 && qt === q[0]) firstWord = true;
    }
  }
  const exact = matched === q.length;
  // Approché : tous les mots sauf un (requêtes de 3 mots ou plus seulement).
  if (!exact && !(q.length >= 3 && matched >= q.length - 1)) return null;
  const score = (exact ? 0 : 100) - (firstWord ? 10 : 0) + nameTokens.length;
  return { matched, total: q.length, score };
}

/** Filtre et trie une liste par pertinence ; `approx` indique les résultats approchés. */
export function searchFoods<T>(items: T[], query: string, name: (item: T) => string): { item: T; approx: boolean }[] {
  const hits: { item: T; approx: boolean; score: number }[] = [];
  for (const item of items) {
    const m = matchFood(query, name(item));
    if (m) hits.push({ item, approx: m.matched < m.total, score: m.score });
  }
  return hits.sort((a, b) => a.score - b.score).map(({ item, approx }) => ({ item, approx }));
}
