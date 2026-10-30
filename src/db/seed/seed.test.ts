import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FitPilotDB, updateSettings } from '../db';
import { ensureSeed } from './seed';
import { SEED_EXERCISES } from './exercises';
import { SEED_PLANS } from './programs';

let db: FitPilotDB;
beforeEach(() => {
  db = new FitPilotDB('seed-' + Math.random());
});
afterEach(() => db.delete());

describe('données de départ', () => {
  it('~60 exercices avec des clés uniques et des textes', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(SEED_EXERCISES.map((e) => e.key)).size).toBe(SEED_EXERCISES.length);
    for (const e of SEED_EXERCISES) {
      expect(e.instructions.length).toBeGreaterThan(20);
      expect(e.mistakes.length).toBeGreaterThan(5);
    }
  });

  it('tous les programmes référencent des exercices existants', () => {
    const keys = new Set(SEED_EXERCISES.map((e) => e.key));
    for (const plan of SEED_PLANS) for (const p of plan.programs) for (const pe of p.exercises) expect(keys.has(pe.ex), pe.ex).toBe(true);
  });

  it('insère une seule fois (idempotent)', async () => {
    await ensureSeed(db);
    const n = await db.exercises.count();
    const programs = await db.programs.count();
    expect(n).toBe(SEED_EXERCISES.length);
    expect(programs).toBe(SEED_PLANS.reduce((s, p) => s + p.programs.length, 0));
    await updateSettings({ seedVersion: 0 }, db); // forcer une nouvelle passe
    await ensureSeed(db);
    expect(await db.exercises.count()).toBe(n);
    expect(await db.programs.count()).toBe(programs);
  });

  it('respecte les suppressions de l’utilisateur', async () => {
    await ensureSeed(db);
    const first = await db.programs.toCollection().first();
    await db.programs.delete(first!.id!);
    await ensureSeed(db);
    expect(await db.programs.get(first!.id!)).toBeUndefined();
  });

  it('le plan « 3 j + 2 courses » a exactement une séance de jambes lourde', () => {
    const plan = SEED_PLANS.find((p) => p.key === 'gym3_run2')!;
    expect(plan.programs.filter((p) => p.legsHeavy)).toHaveLength(1);
  });
});
