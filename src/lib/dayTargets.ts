// Objectifs du jour : cyclage des calories (jours d'entraînement / de repos) et mode Ramadan.
//
// Cyclage : la moyenne de la semaine reste égale à l'objectif de base. Les jours d'entraînement
// reçoivent +X %, les jours de repos ce qu'il faut en moins pour compenser. Les protéines ne
// changent pas ; ce sont surtout les glucides qui varient (carburant de l'entraînement).
// Garde-fous : jamais sous le BMR, jamais plus de 15 % sous l'objectif de base.
//
// Ramadan : le déficit n'est jamais agressif (au plus 10 % sous la dépense estimée), et l'eau
// se boit entre le ftour et le s'hour.
import type { Targets } from './energy';

export interface DayTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  /** Ce qui a modifié l'objectif de base. */
  reasons: ('training' | 'rest' | 'ramadan_cap')[];
}

export const CYCLING_DEFAULT_PCT = 0.1;
const MAX_REST_CUT = 0.15;
const RAMADAN_MAX_DEFICIT = 0.1;

const round10 = (n: number) => Math.round(n / 10) * 10;

function withCalories(base: Targets, calories: number): Pick<DayTargets, 'calories' | 'proteinG' | 'carbsG' | 'fatG'> {
  // Protéines fixes, lipides fixes ; les glucides absorbent la différence.
  const carbsG = Math.max(0, Math.round((calories - base.proteinG * 4 - base.fatG * 9) / 4));
  return { calories, proteinG: base.proteinG, fatG: base.fatG, carbsG };
}

/**
 * Calories d'un jour selon le cyclage. `trainingDays` = nombre de jours d'entraînement de la semaine
 * (1 à 6 ; sinon pas de cyclage possible car il n'y a rien à compenser).
 */
export function cycledCalories(base: Pick<Targets, 'calories' | 'bmr'>, isTraining: boolean, trainingDays: number, pct = CYCLING_DEFAULT_PCT): number {
  if (trainingDays <= 0 || trainingDays >= 7) return base.calories;
  let up = pct;
  // Compensation sur les jours de repos pour garder la même moyenne hebdomadaire.
  let down = (up * trainingDays) / (7 - trainingDays);
  if (down > MAX_REST_CUT) {
    down = MAX_REST_CUT;
    up = (down * (7 - trainingDays)) / trainingDays;
  }
  // Le jour de repos ne descend jamais sous le BMR ; le bonus du jour d'entraînement est réduit d'autant.
  const restRaw = base.calories * (1 - down);
  if (restRaw < base.bmr) {
    down = Math.max(0, 1 - base.bmr / base.calories);
    up = (down * (7 - trainingDays)) / trainingDays;
  }
  return round10(base.calories * (isTraining ? 1 + up : 1 - down));
}

export interface RamadanSettings {
  enabled: boolean;
  /** « HH:MM » */
  suhoor: string;
  iftar: string;
}

export function dayTargets(
  base: Targets,
  opts: { cycling?: { enabled: boolean; pct?: number; isTraining: boolean; trainingDays: number }; ramadan?: RamadanSettings },
): DayTargets {
  const reasons: DayTargets['reasons'] = [];
  let calories = base.calories;
  if (opts.cycling?.enabled && opts.cycling.trainingDays > 0 && opts.cycling.trainingDays < 7) {
    calories = cycledCalories(base, opts.cycling.isTraining, opts.cycling.trainingDays, opts.cycling.pct);
    reasons.push(opts.cycling.isTraining ? 'training' : 'rest');
  }
  if (opts.ramadan?.enabled) {
    const floor = round10(Math.max(base.tdee * (1 - RAMADAN_MAX_DEFICIT), base.bmr));
    if (calories < floor) {
      calories = floor;
      reasons.push('ramadan_cap');
    }
  }
  return { ...withCalories(base, calories), waterMl: base.waterMl, reasons };
}

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

export const isValidTime = (hhmm: string) => toMin(hhmm) !== null;

const fmtMin = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export interface RamadanPlan {
  fastingMin: number;
  /** Fenêtre pour manger et boire (ftour → s'hour), en minutes. */
  eatingMin: number;
  /** Plan d'hydratation : heure et quantité. */
  water: { at: string; ml: number }[];
  /** Créneaux conseillés pour s'entraîner. */
  training: { from: string; to: string; kind: 'light' | 'intense' }[];
}

/**
 * Plan du jour : eau répartie entre ftour et s'hour (un grand verre au ftour, puis toutes les ~1 h 30,
 * un dernier au s'hour), entraînement léger juste avant le ftour ou intense 1 h 30 à 2 h après.
 */
export function ramadanPlan(r: Pick<RamadanSettings, 'suhoor' | 'iftar'>, waterMl: number): RamadanPlan | null {
  const s = toMin(r.suhoor);
  const f = toMin(r.iftar);
  if (s === null || f === null) return null;
  const fastingMin = (f - s + 1440) % 1440;
  const eatingMin = 1440 - fastingMin;
  if (fastingMin < 360 || eatingMin < 240) return null;
  const slots = Math.max(3, Math.min(8, Math.floor(eatingMin / 90) + 1));
  const step = (eatingMin - 30) / (slots - 1);
  const per = Math.round(waterMl / slots / 50) * 50;
  const water = Array.from({ length: slots }, (_, i) => ({ at: fmtMin(f + Math.round(i * step)), ml: per }));
  // Le reste (arrondi) va au premier verre du ftour.
  water[0].ml += waterMl - per * slots;
  return {
    fastingMin,
    eatingMin,
    water,
    training: [
      { from: fmtMin(f - 75), to: fmtMin(f - 15), kind: 'light' },
      { from: fmtMin(f + 90), to: fmtMin(f + 180), kind: 'intense' },
    ],
  };
}
