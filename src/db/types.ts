// Types des enregistrements stockés dans IndexedDB.
// Les champs non indexés peuvent être ajoutés sans migration ; les index sont dans db.ts.
import type { ISODate } from '@/lib/dates';

export type { Profile } from '@/lib/schemas';
import type { Category, Equipment } from './seed/exercises';
import type { RecordDistance } from '@/lib/running';
import type { RunWeather } from '@/lib/openMeteo';
import type { VoicePrefs } from '@/lib/voice';
import type { WorkoutBlock } from '@/lib/guided';
import type { Micros } from '@/lib/micros';
import type { RamadanSettings } from '@/lib/dayTargets';
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
  /** Annonces vocales pendant la course. */
  voice?: VoicePrefs;
  /** Paire de chaussures attribuée par défaut aux nouvelles courses. */
  defaultShoeId?: number;
  /** Calories différentes les jours d'entraînement et de repos (même moyenne sur la semaine). */
  calorieCycling?: { enabled: boolean; pct: number };
  ramadan?: RamadanSettings;
  /** Pause et reprise automatiques pendant la course GPS (activé par défaut). */
  autoPause?: boolean;
  /** Liste de courses : aliments cochés, par semaine (lundi ISO). */
  shoppingChecked?: Record<string, number[]>;
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
  /** Nom (ex. celui d'une course importée de Strava). */
  name?: string;
  notes?: string;
  /** Meilleurs temps détectés sur le tracé (s) : 400 m, 1 km, 1 mile, 5 km, 10 km, semi. */
  bestEfforts?: Partial<Record<RecordDistance, number>>;
  scheduledId?: number;
  createdAt: number;
  /** Heure de départ (ms), pour la météo et la détection des doublons à l'import. */
  startedAt?: number;
  shoeId?: number;
  /** Effort ressenti 1–10 (sert au calcul de la charge d'entraînement). */
  rpe?: number;
  elevGainM?: number;
  elevLossM?: number;
  /** Origine de l'altitude : GPS / fichier importé, ou modèle de terrain Open-Meteo. */
  elevSource?: 'gps' | 'dem';
  weather?: RunWeather;
  /** Version de l'analyse déjà calculée (recalcul automatique quand l'analyse évolue). */
  analysisVersion?: number;
  importedFrom?: 'gpx' | 'fit';
  /** Séance guidée suivie. */
  workoutName?: string;
  /** Tracé allégé (≤ 80 points [lat, lng]) pour l'historique et les parcours favoris. */
  preview?: [number, number][];
  /** Recadrée par l'utilisateur (début / fin retirés). */
  cropped?: boolean;
  /** Distance (m) estimée en ligne droite pendant des trous GPS (incluse dans distanceKm). */
  estimatedM?: number;
}

/** Parcours favori : tracé de référence pour comparer ses temps sur le même trajet. */
export interface FavoriteRoute {
  id?: number;
  name: string;
  preview: [number, number][];
  distanceM: number;
  /** Course d'origine. */
  runId?: number;
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
  /** Altitude (m). */
  alt?: number;
  /** Point qui suit un trou GPS (app suspendue) : la ligne depuis le point précédent est estimée. */
  gapBefore?: boolean;
}

/** Course GPS en cours d'enregistrement (une seule ligne, id « current »). */
export interface LiveRunState {
  id: 'current';
  status: 'running' | 'paused' | 'stopped';
  seg: number;
  activeMs: number;
  resumedAt: number | null;
  startedAt: number;
  rejected: number;
  /** Nombre de points déjà écrits dans livePoints. */
  pointCount: number;
  updatedAt: number;
}

export interface LivePoint {
  id?: number;
  t: number;
  lat: number;
  lng: number;
  accuracy: number;
  seg?: number;
  alt?: number;
  gapBefore?: boolean;
}

export interface Shoe {
  id?: number;
  name: string;
  /** Km déjà parcourus avant de suivre la paire dans l'app. */
  startKm: number;
  /** Seuil d'alerte de remplacement (km). */
  alertKm: number;
  retired: boolean;
  createdAt: number;
}

export interface RunWorkout {
  id?: number;
  name: string;
  runType: RunType;
  blocks: WorkoutBlock[];
  createdAt: number;
}

export interface Food extends Micros {
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
  /** Code-barres (produit Open Food Facts gardé en cache local). */
  barcode?: string;
  brand?: string;
  nutriscore?: string;
  /** Code de l'aliment CIQUAL d'origine. */
  ciqualCode?: number;
  favorite?: boolean;
  /** Prix (DH) pour `grams` grammes, pour le budget des courses. */
  price?: { mad: number; grams: number };
}

export interface Recipe {
  id?: number;
  name: string;
  items: { foodId: number; grams: number }[];
  /** Poids final cuit (g) ; sinon somme des ingrédients (crus). */
  cookedWeightG?: number;
  /** Nombre de portions : ajoute l'unité « portion » à l'aliment de la recette. */
  servings?: number;
  /** Aliment correspondant (pour l'ajouter à un repas comme n'importe quel aliment). */
  foodId?: number;
}

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'extra';

export interface Meal {
  id?: number;
  date: ISODate;
  type: MealType;
}

export interface MealItem extends Micros {
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
  /** Valeurs estimées (ajout rapide, photo analysée par l'IA, plat traditionnel). */
  estimated?: boolean;
}

/** Aliment prévu dans le planificateur de repas (copié dans le journal le jour venu). */
export interface MealPlanItem {
  id?: number;
  date: ISODate;
  type: MealType;
  foodId: number;
  grams: number;
  name: string;
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
