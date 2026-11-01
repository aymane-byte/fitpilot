import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { FitPilotDB } from './db';

describe('migration v1 → v2', () => {
  it('conserve les données de la phase 1 et ajoute les nouveaux index', async () => {
    const name = 'mig-' + Math.random();
    // Base telle qu'elle existe sur un téléphone en phase 1 (schéma v1 uniquement).
    const v1 = new Dexie(name);
    v1.version(1).stores({
      profile: 'id', settings: 'id', exercises: '++id, name, category, *muscles, custom', programs: '++id, name',
      programExercises: '++id, programId, exerciseId, [programId+order]', workoutSessions: '++id, date, programId',
      workoutSets: '++id, sessionId, exerciseId', runs: '++id, date, type', runPoints: '++id, runId', foods: '++id, name, category, custom',
      recipes: '++id, name', meals: '++id, date, type, [date+type]', mealItems: '++id, mealId, foodId', waterLogs: '++id, date',
      bodyMeasurements: '++id, date', progressPhotos: '++id, date', goals: '++id, type, status', scheduledActivities: '++id, date, kind, status',
      coachConversations: '++id, updatedAt', coachMessages: '++id, conversationId, createdAt',
    });
    await v1.table('bodyMeasurements').add({ date: '2026-10-30', weightKg: 78, createdAt: 1 });
    await v1.table('workoutSessions').add({ date: '2026-10-30', name: 'X', startedAt: 5, endedAt: 9 });
    await v1.table('runs').add({ date: '2026-10-29', type: 'easy', distanceKm: 5, durationSec: 1800, source: 'manual', createdAt: 1 });
    v1.close();

    const v2 = new FitPilotDB(name);
    await v2.open();
    expect(v2.verno).toBe(7);
    // v4 : courses conservées, nouvelles tables vides, index shoeId utilisable.
    expect(await v2.runs.count()).toBe(1);
    expect(await v2.shoes.count()).toBe(0);
    expect(await v2.runs.where('shoeId').equals(1).count()).toBe(0);
    expect(await v2.bodyMeasurements.count()).toBe(1);
    // Le nouvel index startedAt est utilisable sur les anciennes lignes.
    expect((await v2.workoutSessions.orderBy('startedAt').first())?.name).toBe('X');
    await v2.delete();
  });
});
