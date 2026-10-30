// Calculs énergétiques : BMR, TDEE, objectif calorique, macros, eau, IMC, masse grasse estimée.
// Fonctions pures : aucune dépendance à la base de données ou à l'UI.

export type Gender = 'male' | 'female';
export type Goal = 'fat_loss' | 'recomp' | 'muscle_gain' | 'maintenance' | 'endurance';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Ajustement calorique par objectif, en fraction du TDEE. */
export const GOAL_ADJUSTMENT: Record<Goal, number> = {
  fat_loss: -0.2,
  recomp: -0.1,
  muscle_gain: 0.1,
  maintenance: 0,
  endurance: 0,
};

/** Protéines en g par kg de poids de référence (fourchette 1,6–2,2 g/kg). */
export const PROTEIN_PER_KG: Record<Goal, number> = {
  fat_loss: 2.2,
  recomp: 2.0,
  muscle_gain: 1.8,
  maintenance: 1.6,
  endurance: 1.6,
};

export const FAT_SHARE = 0.25; // 25 % des calories
export const FAT_MIN_PER_KG = 0.6;
/** Perte maximale autorisée : 0,75 % du poids par semaine (dans la fourchette sûre 0,5–1 %). */
export const MAX_WEEKLY_LOSS_FRACTION = 0.0075;
export const KCAL_PER_KG_FAT = 7700;

/** Mifflin-St Jeor : 10×poids + 6,25×taille − 5×âge + 5 (homme) / − 161 (femme). */
export function bmr(weightKg: number, heightCm: number, age: number, gender: Gender): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161);
}

export function tdee(bmrKcal: number, activity: ActivityLevel): number {
  return bmrKcal * ACTIVITY_FACTORS[activity];
}

/** Niveau d'activité suggéré à partir du nombre de séances par semaine (sport uniquement). */
export function suggestActivityLevel(sessionsPerWeek: number): ActivityLevel {
  if (sessionsPerWeek <= 0) return 'sedentary';
  if (sessionsPerWeek <= 3) return 'light';
  if (sessionsPerWeek <= 5) return 'moderate';
  if (sessionsPerWeek <= 7) return 'active';
  return 'very_active';
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

/**
 * Poids de référence pour les protéines : en cas d'IMC > 30, on utilise le poids
 * correspondant à un IMC de 25 pour éviter des apports protéiques démesurés.
 */
export function proteinReferenceWeight(weightKg: number, heightCm: number): number {
  if (bmi(weightKg, heightCm) <= 30) return weightKg;
  const h = heightCm / 100;
  return 25 * h * h;
}

export function waterTargetMl(weightKg: number): number {
  return Math.round((weightKg * 35) / 50) * 50;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export interface TargetsInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activity: ActivityLevel;
  goal: Goal;
}

export interface Targets {
  bmr: number;
  tdee: number;
  /** Ajustement demandé par l'objectif (kcal/jour, négatif = déficit). */
  goalAdjustment: number;
  calories: number;
  /** Raisons pour lesquelles l'objectif a été corrigé (plancher BMR, perte max). */
  safetyNotes: ('floor_bmr' | 'max_loss')[];
  proteinG: number;
  fatG: number;
  carbsG: number;
  waterMl: number;
  proteinPerKg: number;
  expectedWeeklyChangeKg: number;
}

export function computeTargets(input: TargetsInput): Targets {
  const b = bmr(input.weightKg, input.heightCm, input.age, input.gender);
  const t = tdee(b, input.activity);
  const goalAdjustment = t * GOAL_ADJUSTMENT[input.goal];
  let calories = t + goalAdjustment;
  const safetyNotes: Targets['safetyNotes'] = [];

  const maxDailyDeficit = (input.weightKg * MAX_WEEKLY_LOSS_FRACTION * KCAL_PER_KG_FAT) / 7;
  if (t - calories > maxDailyDeficit) {
    calories = t - maxDailyDeficit;
    safetyNotes.push('max_loss');
  }
  if (calories < b) {
    calories = b;
    safetyNotes.push('floor_bmr');
  }
  calories = round10(calories);
  // L'arrondi ne doit jamais repasser sous le BMR.
  if (calories < b) calories += 10;

  const proteinPerKg = PROTEIN_PER_KG[input.goal];
  const proteinG = Math.round(proteinReferenceWeight(input.weightKg, input.heightCm) * proteinPerKg);
  const fatG = Math.round(Math.max((calories * FAT_SHARE) / 9, input.weightKg * FAT_MIN_PER_KG));
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    bmr: Math.round(b),
    tdee: Math.round(t),
    goalAdjustment: Math.round(goalAdjustment),
    calories,
    safetyNotes,
    proteinG,
    fatG,
    carbsG,
    waterMl: waterTargetMl(input.weightKg),
    proteinPerKg,
    expectedWeeklyChangeKg: Math.round((((calories - t) * 7) / KCAL_PER_KG_FAT) * 100) / 100,
  };
}

/**
 * Estimation de la masse grasse — formule de l'US Navy (mesures en cm).
 * C'est une ESTIMATION (erreur typique ±3–4 %), à afficher comme telle.
 */
export function bodyFatNavy(p: {
  gender: Gender;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipCm?: number;
}): number | null {
  const { gender, heightCm, waistCm, neckCm, hipCm } = p;
  let value: number;
  if (gender === 'male') {
    if (waistCm - neckCm <= 0) return null;
    value = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (!hipCm || waistCm + hipCm - neckCm <= 0) return null;
    value = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  }
  if (!Number.isFinite(value) || value < 2 || value > 70) return null;
  return Math.round(value * 10) / 10;
}
