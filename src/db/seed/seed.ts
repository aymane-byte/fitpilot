import { db as defaultDb, getSettings, updateSettings, type FitPilotDB } from '../db';
import { SEED_EXERCISES } from './exercises';
import { SEED_PLANS } from './programs';
import { SEED_FOODS } from './foods';

/**
 * Versions des données de départ. Chaque étape ne tourne qu'une fois :
 * 1 = exercices + programmes (phase 2), 2 = aliments (phase 3).
 */
export const SEED_VERSION = 2;

/**
 * Insère les exercices et programmes de base manquants (idempotent : basé sur les clés).
 * Ne s'exécute qu'une fois par version, pour respecter les suppressions faites par l'utilisateur.
 */
export async function ensureSeed(database: FitPilotDB = defaultDb): Promise<void> {
  const settings = await getSettings(database);
  const done = settings.seedVersion ?? 0;
  if (done >= SEED_VERSION) return;
  if (done < 1) await seedTraining(database);
  if (done < 2) await seedFoods(database);
  await updateSettings({ seedVersion: SEED_VERSION }, database);
}

async function seedFoods(database: FitPilotDB) {
  await database.transaction('rw', database.foods, async () => {
    const existing = new Set((await database.foods.toArray()).map((f) => f.key).filter(Boolean));
    await database.foods.bulkAdd(SEED_FOODS.filter((f) => !existing.has(f.key)).map((f) => ({ ...f, custom: false })));
  });
}

async function seedTraining(database: FitPilotDB) {
  await database.transaction('rw', [database.exercises, database.programs, database.programExercises], async () => {
    const existing = new Map((await database.exercises.toArray()).filter((e) => e.key).map((e) => [e.key!, e.id!]));
    for (const ex of SEED_EXERCISES) {
      if (existing.has(ex.key)) continue;
      const id = await database.exercises.add({ ...ex, custom: false });
      existing.set(ex.key, id as number);
    }

    const programKeys = new Set((await database.programs.toArray()).map((p) => p.builtinKey).filter(Boolean));
    for (const plan of SEED_PLANS) {
      for (const [order, prog] of plan.programs.entries()) {
        if (programKeys.has(prog.key)) continue;
        const programId = (await database.programs.add({
          name: prog.name,
          plan: plan.key,
          planOrder: order,
          builtinKey: prog.key,
          legsHeavy: prog.legsHeavy,
          createdAt: Date.now(),
        })) as number;
        await database.programExercises.bulkAdd(
          prog.exercises.map((pe, i) => {
            const exerciseId = existing.get(pe.ex);
            if (exerciseId === undefined) throw new Error(`Exercice inconnu dans le seed : ${pe.ex}`);
            return { programId, exerciseId, order: i, sets: pe.sets, reps: pe.reps, rpe: pe.rpe };
          }),
        );
      }
    }
  });
}
