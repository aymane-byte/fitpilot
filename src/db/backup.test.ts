import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FitPilotDB, getSettings, updateSettings } from './db';
import { decodeRow, encodeRow, exportData, importData, needsBackupReminder, parseBackup } from './backup';
import type { Profile } from './types';

const profile: Profile = {
  id: 'me',
  name: 'Test',
  age: 20,
  gender: 'male',
  heightCm: 170,
  weightKg: 78,
  goal: 'recomp',
  injuries: '',
  gymLevel: 'intermediate',
  gymDaysPerWeek: 3,
  equipment: 'gym',
  runLevel: 'intermediate',
  runDaysPerWeek: 2,
  canRunMinutes: 30,
  preferredTime: 'evening',
  activityLevel: 'moderate',
  dietaryPreferences: '',
  allergies: '',
  foodBudget: 'medium',
  supplements: 'Créatine monohydrate',
  createdAt: 1,
  updatedAt: 1,
};

let source: FitPilotDB;
let target: FitPilotDB;

beforeEach(async () => {
  source = new FitPilotDB('src-' + Math.random());
  target = new FitPilotDB('dst-' + Math.random());
  await source.profile.put(profile);
  await source.bodyMeasurements.bulkAdd([
    { date: '2026-10-29', weightKg: 78.2, createdAt: 1 },
    { date: '2026-10-30', weightKg: 78, waistCm: 84, createdAt: 2 },
  ]);
  await source.waterLogs.add({ date: '2026-10-30', ml: 250, at: 3 });
  await updateSettings({ theme: 'light', geminiApiKey: 'SECRET-SRC' }, source);
});

afterEach(async () => {
  await source.delete();
  await target.delete();
});

describe('sauvegarde', () => {
  it('aller-retour export → JSON → import identique', async () => {
    const json = JSON.stringify(await exportData({ includePhotos: false }, source));
    const parsed = parseBackup(json, target);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts.bodyMeasurements).toBe(2);

    await importData(parsed.backup, target);
    expect(await target.profile.get('me')).toEqual(profile);
    expect(await target.bodyMeasurements.toArray()).toEqual(await source.bodyMeasurements.toArray());
    expect(await target.waterLogs.count()).toBe(1);
    expect((await getSettings(target)).theme).toBe('light');
  });

  it("n'exporte jamais les clés API et garde celles de l'appareil", async () => {
    await updateSettings({ geminiApiKey: 'SECRET-DST' }, target);
    const backup = await exportData({ includePhotos: false }, source);
    expect(JSON.stringify(backup)).not.toContain('SECRET-SRC');
    await importData(backup, target);
    expect((await getSettings(target)).geminiApiKey).toBe('SECRET-DST');
  });

  it('remplace les données existantes', async () => {
    await target.bodyMeasurements.add({ date: '2020-01-01', weightKg: 99, createdAt: 0 });
    await importData(await exportData({ includePhotos: false }, source), target);
    expect(await target.bodyMeasurements.count()).toBe(2);
  });

  it('photos exclues : les photos de l’appareil sont conservées', async () => {
    await target.progressPhotos.add({ date: '2026-10-01', pose: 'front', bytes: new Uint8Array([1]).buffer, type: 'image/jpeg' });
    const backup = await exportData({ includePhotos: false }, source);
    expect(backup.tables.progressPhotos).toBeUndefined();
    await importData(backup, target);
    expect(await target.progressPhotos.count()).toBe(1);
  });
});

describe('sauvegarde avec photos', () => {
  it('aller-retour complet base → JSON → base avec une photo (ArrayBuffer)', async () => {
    const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3]);
    await source.progressPhotos.add({ date: '2026-10-30', pose: 'side', bytes: bytes.buffer, type: 'image/jpeg' });
    const json = JSON.stringify(await exportData({ includePhotos: true }, source));
    expect(json).toContain('"__bytes":true');
    const parsed = parseBackup(json, target);
    if (!parsed.ok) throw new Error(parsed.error);
    await importData(parsed.backup, target);
    const [photo] = await target.progressPhotos.toArray();
    expect(photo).toMatchObject({ pose: 'side', type: 'image/jpeg' });
    expect(new Uint8Array(photo.bytes)).toEqual(bytes);
  });

  // Le stockage réel d'un Blob dans IndexedDB est vérifié en E2E (WebKit) ; ici on teste l'encodage.
  it('encode un Blob en base64 et le décode à l’identique', async () => {
    const bytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
    const encoded = await encodeRow({ date: '2026-10-30', pose: 'front', blob: new Blob([bytes], { type: 'image/jpeg' }) });
    const json = JSON.parse(JSON.stringify(encoded));
    expect(json.blob).toMatchObject({ __blob: true, type: 'image/jpeg' });
    const decoded = decodeRow(json);
    const blob = decoded.blob as Blob;
    expect(blob.type).toBe('image/jpeg');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
});

describe('validation import', () => {
  it('refuse un JSON invalide', () => {
    expect(parseBackup('{oops', target).ok).toBe(false);
  });
  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(parseBackup(JSON.stringify({ hello: 1 }), target).ok).toBe(false);
  });
  it('refuse une version de schéma plus récente', async () => {
    const b = await exportData({ includePhotos: false }, source);
    const r = parseBackup(JSON.stringify({ ...b, schemaVersion: 999 }), target);
    expect(r.ok).toBe(false);
  });
  it('refuse une table inconnue', async () => {
    const b = await exportData({ includePhotos: false }, source);
    const r = parseBackup(JSON.stringify({ ...b, tables: { ...b.tables, hack: [] } }), target);
    expect(r.ok).toBe(false);
  });
  it('refuse un profil invalide', async () => {
    const b = await exportData({ includePhotos: false }, source);
    const bad = { ...b, tables: { ...b.tables, profile: [{ ...profile, age: -3 }] } };
    expect(parseBackup(JSON.stringify(bad), target).ok).toBe(false);
  });
  it('refuse une date invalide', async () => {
    const b = await exportData({ includePhotos: false }, source);
    const bad = { ...b, tables: { ...b.tables, waterLogs: [{ date: '2026-13-45', ml: 1, at: 1 }] } };
    expect(parseBackup(JSON.stringify(bad), target).ok).toBe(false);
  });
});

describe('rappel de sauvegarde', () => {
  const day = 86_400_000;
  it('jamais sauvegardé → rappel', () => expect(needsBackupReminder(undefined)).toBe(true));
  it('il y a 3 jours → pas de rappel', () => expect(needsBackupReminder(Date.now() - 3 * day)).toBe(false));
  it('il y a 8 jours → rappel', () => expect(needsBackupReminder(Date.now() - 8 * day)).toBe(true));
});
