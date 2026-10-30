import Dexie, { type EntityTable } from 'dexie';
import type * as T from './types';

export class FitPilotDB extends Dexie {
  profile!: EntityTable<T.Profile, 'id'>;
  settings!: EntityTable<T.Settings, 'id'>;
  exercises!: EntityTable<T.Exercise, 'id'>;
  programs!: EntityTable<T.Program, 'id'>;
  programExercises!: EntityTable<T.ProgramExercise, 'id'>;
  workoutSessions!: EntityTable<T.WorkoutSession, 'id'>;
  workoutSets!: EntityTable<T.WorkoutSet, 'id'>;
  runs!: EntityTable<T.Run, 'id'>;
  runPoints!: EntityTable<T.RunPoint, 'id'>;
  foods!: EntityTable<T.Food, 'id'>;
  recipes!: EntityTable<T.Recipe, 'id'>;
  meals!: EntityTable<T.Meal, 'id'>;
  mealItems!: EntityTable<T.MealItem, 'id'>;
  waterLogs!: EntityTable<T.WaterLog, 'id'>;
  bodyMeasurements!: EntityTable<T.BodyMeasurement, 'id'>;
  progressPhotos!: EntityTable<T.ProgressPhoto, 'id'>;
  goals!: EntityTable<T.Goal, 'id'>;
  scheduledActivities!: EntityTable<T.ScheduledActivity, 'id'>;
  coachConversations!: EntityTable<T.CoachConversation, 'id'>;
  coachMessages!: EntityTable<T.CoachMessage, 'id'>;
  shoes!: EntityTable<T.Shoe, 'id'>;
  runWorkouts!: EntityTable<T.RunWorkout, 'id'>;
  mealPlans!: EntityTable<T.MealPlanItem, 'id'>;

  constructor(name = 'fitpilot') {
    super(name);
    // Versionnage : ne jamais modifier une version existante. Pour changer un index,
    // ajouter this.version(N + 1).stores({...}).upgrade(tx => ...) en dessous.
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      exercises: '++id, name, category, *muscles, custom',
      programs: '++id, name',
      programExercises: '++id, programId, exerciseId, [programId+order]',
      workoutSessions: '++id, date, programId',
      workoutSets: '++id, sessionId, exerciseId',
      runs: '++id, date, type',
      runPoints: '++id, runId',
      foods: '++id, name, category, custom',
      recipes: '++id, name',
      meals: '++id, date, type, [date+type]',
      mealItems: '++id, mealId, foodId',
      waterLogs: '++id, date',
      bodyMeasurements: '++id, date',
      progressPhotos: '++id, date',
      goals: '++id, type, status',
      scheduledActivities: '++id, date, kind, status',
      coachConversations: '++id, updatedAt',
      coachMessages: '++id, conversationId, createdAt',
    });
    // v2 (phase 2) : index pour les données de départ et les programmes.
    this.version(2).stores({
      exercises: '++id, name, category, *muscles, custom, key',
      programs: '++id, name, plan, builtinKey',
      workoutSets: '++id, sessionId, exerciseId, [exerciseId+sessionId]',
      workoutSessions: '++id, date, programId, startedAt',
    });
    // v3 (phase 3) : aliments par clé et repas.
    this.version(3).stores({
      foods: '++id, name, category, custom, key, recipeId',
    });
    // v4 (course avancée) : chaussures, séances guidées perso, courses par chaussure.
    this.version(4).stores({
      runs: '++id, date, type, shoeId',
      shoes: '++id, retired',
      runWorkouts: '++id, name',
    });
    // v5 (nutrition complète) : produits scannés par code-barres, planificateur de repas.
    this.version(5).stores({
      foods: '++id, name, category, custom, key, recipeId, barcode, ciqualCode',
      mealPlans: '++id, date, [date+type]',
    });
  }
}

export const db = new FitPilotDB();

export const TABLE_NAMES = db.tables.map((t) => t.name);

export const DEFAULT_SETTINGS: T.Settings = {
  id: 'app',
  theme: 'dark',
  backupIncludesPhotos: false,
  coachProvider: 'rules',
  recoveryHoursLegsBeforeRun: 24,
  restTimerSec: 90,
};

export async function getSettings(database: FitPilotDB = db): Promise<T.Settings> {
  return { ...DEFAULT_SETTINGS, ...(await database.settings.get('app')) };
}

export async function updateSettings(patch: Partial<Omit<T.Settings, 'id'>>, database: FitPilotDB = db) {
  const current = await getSettings(database);
  await database.settings.put({ ...current, ...patch });
}
