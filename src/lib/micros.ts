// Micronutriments : fibres, sucres, sel, graisses saturées, fer, calcium, potassium, vitamines D et B12.
// Repères pour adultes (ANSES 2016-2021 / EFSA, OMS pour le sel et les graisses saturées).
// Une valeur inconnue (non renseignée pour un aliment) n'est PAS comptée comme 0 : on affiche
// la part des aliments renseignés pour que le total ne soit pas faussement bas.

export type MicroKey = 'fiberG' | 'sugarsG' | 'saltG' | 'satFatG' | 'ironMg' | 'calciumMg' | 'potassiumMg' | 'vitDUg' | 'b12Ug';

export type Micros = Partial<Record<MicroKey, number>>;

export const MICRO_KEYS: MicroKey[] = ['fiberG', 'sugarsG', 'saltG', 'satFatG', 'ironMg', 'calciumMg', 'potassiumMg', 'vitDUg', 'b12Ug'];

export const MICRO_UNITS: Record<MicroKey, string> = { fiberG: 'g', sugarsG: 'g', saltG: 'g', satFatG: 'g', ironMg: 'mg', calciumMg: 'mg', potassiumMg: 'mg', vitDUg: 'µg', b12Ug: 'µg' };

/** Sodium (mg) ↔ sel (g) : sel = sodium × 2,5. */
export const sodiumMgFromSalt = (saltG: number) => Math.round((saltG / 2.5) * 1000);

export interface MicroTarget {
  /** Objectif minimal (apport conseillé) ou plafond à ne pas dépasser. */
  kind: 'min' | 'max';
  value: number;
  source: string;
}

export function microTargets(p: { gender: 'male' | 'female'; age: number }, kcal: number): Record<MicroKey, MicroTarget> {
  const female = p.gender === 'female';
  return {
    fiberG: { kind: 'min', value: 30, source: 'ANSES' },
    // Sucres totaux hors lactose : plafond ANSES de 100 g/jour.
    sugarsG: { kind: 'max', value: 100, source: 'ANSES' },
    saltG: { kind: 'max', value: 5, source: 'OMS' },
    satFatG: { kind: 'max', value: Math.round((kcal * 0.1) / 9), source: 'OMS (10 % des calories)' },
    // Fer : 11 mg (hommes, femmes ménopausées), 16 mg (femmes en âge de procréer, pertes élevées).
    ironMg: { kind: 'min', value: female && p.age < 50 ? 16 : 11, source: 'ANSES' },
    calciumMg: { kind: 'min', value: p.age < 18 ? 1150 : p.age < 25 ? 1000 : 950, source: 'ANSES' },
    potassiumMg: { kind: 'min', value: 3500, source: 'ANSES / EFSA' },
    vitDUg: { kind: 'min', value: 15, source: 'ANSES / EFSA' },
    b12Ug: { kind: 'min', value: 4, source: 'ANSES / EFSA' },
  };
}

export interface MicroTotal {
  value: number;
  /** Part des aliments (en poids) pour lesquels la valeur est connue, 0–1. */
  coverage: number;
}

/** Totaux d'une liste d'aliments saisis (valeurs déjà ramenées à la portion). */
export function microTotals(items: (Micros & { grams: number })[]): Record<MicroKey, MicroTotal> {
  const totalG = items.reduce((s, i) => s + Math.max(0, i.grams), 0);
  const out = {} as Record<MicroKey, MicroTotal>;
  for (const k of MICRO_KEYS) {
    let value = 0;
    let known = 0;
    for (const i of items) {
      const v = i[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        value += v;
        known += Math.max(0, i.grams);
      }
    }
    out[k] = { value: Math.round(value * 100) / 100, coverage: totalG > 0 ? Math.round((known / totalG) * 100) / 100 : 0 };
  }
  return out;
}

/** Micronutriments pour `grams` d'un aliment exprimé pour 100 g. */
export function microsFor(food: Micros, grams: number): Micros {
  const f = Math.max(0, grams) / 100;
  const out: Micros = {};
  for (const k of MICRO_KEYS) {
    const v = food[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * f * 1000) / 1000;
  }
  return out;
}

export type MicroStatus = 'ok' | 'low' | 'high' | 'unknown';

/**
 * Statut d'un total : inconnu si moins de la moitié des aliments sont renseignés ;
 * pour un minimum, « bas » sous 70 % de l'objectif ; pour un plafond, « élevé » au-delà.
 */
export function microStatus(total: MicroTotal, target: MicroTarget): MicroStatus {
  if (total.coverage < 0.5) return 'unknown';
  if (target.kind === 'max') return total.value > target.value ? 'high' : 'ok';
  return total.value < target.value * 0.7 ? 'low' : 'ok';
}

/** Moyenne quotidienne sur plusieurs jours renseignés. */
export function averageMicros(days: Record<MicroKey, MicroTotal>[]): Record<MicroKey, MicroTotal> {
  const out = {} as Record<MicroKey, MicroTotal>;
  for (const k of MICRO_KEYS) {
    const n = days.length;
    out[k] = n
      ? { value: Math.round((days.reduce((s, d) => s + d[k].value, 0) / n) * 100) / 100, coverage: Math.round((days.reduce((s, d) => s + d[k].coverage, 0) / n) * 100) / 100 }
      : { value: 0, coverage: 0 };
  }
  return out;
}
