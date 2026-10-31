/** Convertit une saisie texte (virgule ou point) en nombre, ou undefined si vide/invalide. */
export function parseDecimal(input: string): number | undefined {
  const s = input.trim().replace(',', '.');
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
