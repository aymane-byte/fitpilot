/** Texte normalisé pour la recherche : minuscules, sans accents, ligatures décomposées (œ → oe). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
