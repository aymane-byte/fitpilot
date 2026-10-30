// Types des enregistrements stockés dans IndexedDB.
// Les champs non indexés peuvent être ajoutés sans migration ; les index sont dans db.ts.
import type { ISODate } from '@/lib/dates';

export type { Profile } from '@/lib/schemas';
import type { Category, Equipment } from './seed/exercises';
export type { Category, Equipment };

export type ThemePref = 'dark' | 'light' | 'system';
export type CoachProvider = 'rules' | 'gemini' | 'groq';

export interface Settings {
  id: 'app';
  theme: ThemePref;
  lastBackupAt?: number;
  backupIncludesPhotos: boolean;
  coachProvider: CoachProvider;
  geminiApiKey?: string;
  groqApiKey?: string;
  geminiModel?: string;
  groqModel?: string;
  proxyUrl?: string;
  /** Heures minimum entre une séance de jambes lourde et une course. */
  recoveryHoursLegsBeforeRun: number;
  /** Plan de musculation actif (clé de SEED_PLANS ou « custom »). */
  activePlan?: string;
  /** Plan de course suivi et sa date de début. */
  runPlan?: { key: string; start: string };
  restTimerSec: number;
  /** Rappels in-app à l'ouverture (une fois par jour). */
  inAppReminders?: boolean;
  /** Version des données de départ (exercices, programmes) déjà insérées. */
  seedVersion?: number;
}

export interface Exercise {
  id?: number;
  /** Clé stable des exercices fournis avec l'app (absente pour les exercices perso). */
  key?: string;
  name: string;
  category: Category;
  muscles: string[];
  equipment: Equipment;
  instructions: string;
  mistakes: string;
  custom: boolean;
}

export interface Program {
  id?: number;
  name: string;
  description?: string;
  /** Plan auquel appartient la séance (clé de SEED_PLANS) ; absent = programme perso. */
  plan?: string;
  planOrder?: number;
  builtinKey?: string;
  legsHeavy: boolean;
  createdAt: number;
}

export interface ProgramExercise {
  id?: number;
  programId: number;
  exerciseId: number;
  order: number;
  sets: number;
  reps: number;
  weightKg?: number;
  rpe?: number;
}

export interface WorkoutSession {
  id?: number;
  date: ISODate;
  programId?: number;
  name: string;
  startedAt: number;
  endedAt?: number;
  notes?: string;
  scheduledId?: number;
}

export interface WorkoutSet {
  id?: number;
  sessionId: number;
  exerciseId: number;
  order: number;
  reps: number;
  weightKg: number;
  rpe?: number;
  done: boolean;
  /** Objectif du programme pour cette série (sert aux suggestions de surcharge). */
  targetReps?: number;
  targetRpe?: number;
}

export type RunType = 'easy' | 'tempo' | 'intervals' | 'long' | 'recovery';

export interface Run {
  id?: number;
  date: ISODate;
  type: RunType;
  distanceKm: number;
  durationSec: number;
  source: 'manual' | 'gps';
  notes?: string;
  /** Meilleurs temps mesurés par GPS (s). */
  bestEfforts?: Partial<Record<'1k' | '5k' | '10k', number>>;
  scheduledId?: number;
  createdAt: number;
}

export interface RunPoint {
  id?: number;
  runId: number;
  t: number;
  lat: number;
  lng: number;
  accuracy: number;
  seg?: number;
}

export interface Food {
  id?: number;
  /** Clé stable des aliments fournis avec l'app. */
  key?: string;
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** true si la recette varie selon les familles (valeurs estimées). */
  estimated: boolean;
  source?: string;
  units?: { label: string; grams: number }[];
  allergens?: string[];
  custom: boolean;
  /** Aliment généré par une recette perso (valeurs recalculées quand la recette change). */
  recipeId?: number;
}

export interface Recipe {
  id?: number;
  name: string;
  items: { foodId: number; grams: number }[];
  /** Poids final cuit (g) ; sinon somme des ingrédients. */
  cookedWeightG?: number;
  /** Aliment correspondant (pour l'ajouter à un repas comme n'importe quel aliment). */
  foodId?: number;
}

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'extra';

export interface Meal {
  id?: number;
  date: ISODate;
  type: MealType;
}

export interface MealItem {
  id?: number;
  mealId: number;
  foodId: number;
  grams: number;
  /** Instantané au moment de la saisie : l'historique ne change pas si l'aliment est modifié. */
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Portion saisie, pour l'affichage (ex. 2 × « tranche de khobz »). */
  unitLabel?: string;
  qty?: number;
}

export interface WaterLog {
  id?: number;
  date: ISODate;
  ml: number;
  at: number;
}

export interface BodyMeasurement {
  id?: number;
  date: ISODate;
  weightKg?: number;
  waistCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  hipCm?: number;
  neckCm?: number;
  createdAt: number;
}

export interface ProgressPhoto {
  id?: number;
  date: ISODate;
  pose: 'front' | 'side' | 'back';
  /** Image JPEG compressée. Stockée en ArrayBuffer (certains WebKit refusent les Blob dans IndexedDB). */
  bytes: ArrayBuffer;
  type: string;
}

export interface Goal {
  id?: number;
  type: string;
  target: number;
  status: 'active' | 'done' | 'abandoned';
  deadline?: ISODate;
}

export interface ScheduledActivity {
  id?: number;
  date: ISODate;
  kind: 'workout' | 'run' | 'rest';
  title: string;
  status: 'planned' | 'done' | 'skipped';
  programId?: number;
  legsHeavy?: boolean;
  runType?: RunType;
  /** Heure « HH:MM » (pour l'export Calendrier). */
  time?: string;
  notes?: string;
}

export interface CoachConversation {
  id?: number;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface CoachMessage {
  id?: number;
  conversationId: number;
  role: 'user' | 'assistant';
  provider: CoachProvider;
  content: string;
  createdAt: number;
  model?: string;
  tokens?: number;
  /** Raison du repli sur les règles si le fournisseur choisi a échoué. */
  fallbackReason?: string;
}
