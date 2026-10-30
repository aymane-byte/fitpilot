import { fr, type Dict } from './fr';

// Une seule langue pour l'instant ; ajouter ici les autres dictionnaires (même forme que fr).
const dictionaries: Record<string, Dict> = { fr };

export const t: Dict = dictionaries.fr;

/** Remplace les {variables} dans une chaîne. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const nf = (digits: number) =>
  new Intl.NumberFormat(t.meta.locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function num(n: number, digits = 1): string {
  return nf(digits).format(n);
}

export function signed(n: number, digits = 1): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n), digits);
}
