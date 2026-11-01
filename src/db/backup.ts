// Sauvegarde complète en JSON (export / import avec validation).
// Les clés API ne sont jamais exportées. Les photos (ArrayBuffer/Blob) sont encodées en base64 si demandé.
import { z } from 'zod';
import { profileSchema } from '@/lib/schemas';
import { isValidISODate } from '@/lib/dates';
import { fmt, t } from '@/i18n';
import { db as defaultDb, getSettings, updateSettings, type FitPilotDB } from './db';

export const BACKUP_APP_ID = 'fitpilot-ai';
export const BACKUP_FORMAT = 1;
const SECRET_SETTINGS = ['geminiApiKey', 'groqApiKey'] as const;

type Row = Record<string, unknown>;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  includesPhotos: boolean;
  tables: Record<string, Row[]>;
}

interface EncodedBlob {
  __blob: true;
  type: string;
  base64: string;
}

interface EncodedBytes {
  __bytes: true;
  base64: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(await blob.arrayBuffer());
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64ToBlob(base64: string, type: string): Blob {
  return new Blob([base64ToBytes(base64)], { type });
}

const isEncodedBlob = (v: unknown): v is EncodedBlob =>
  typeof v === 'object' && v !== null && (v as EncodedBlob).__blob === true;
const isEncodedBytes = (v: unknown): v is EncodedBytes =>
  typeof v === 'object' && v !== null && (v as EncodedBytes).__bytes === true;

export async function encodeRow(row: Row): Promise<Row> {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    // Détection par étiquette plutôt que instanceof : fonctionne même entre contextes JS différents.
    const tag = Object.prototype.toString.call(v);
    if (tag === '[object Blob]') out[k] = { __blob: true, type: (v as Blob).type, base64: await blobToBase64(v as Blob) } satisfies EncodedBlob;
    else if (tag === '[object ArrayBuffer]') out[k] = { __bytes: true, base64: bytesToBase64(v as ArrayBuffer) } satisfies EncodedBytes;
    else out[k] = v;
  }
  return out;
}

export function decodeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = isEncodedBlob(v) ? base64ToBlob(v.base64, v.type) : isEncodedBytes(v) ? base64ToBytes(v.base64) : v;
  return out;
}

export async function exportData(
  opts: { includePhotos: boolean },
  database: FitPilotDB = defaultDb,
): Promise<BackupFile> {
  const tables: Record<string, Row[]> = {};
  for (const table of database.tables) {
    if (table.name === 'progressPhotos' && !opts.includePhotos) continue;
    // Course GPS en cours : état temporaire, propre à ce téléphone.
    if (table.name === 'liveRun' || table.name === 'livePoints') continue;
    const rows = (await table.toArray()) as Row[];
    tables[table.name] = await Promise.all(
      rows.map((r) => {
        if (table.name !== 'settings') return encodeRow(r);
        const clean = { ...r };
        for (const key of SECRET_SETTINGS) delete clean[key];
        return encodeRow(clean);
      }),
    );
  }
  return {
    app: BACKUP_APP_ID,
    format: BACKUP_FORMAT,
    schemaVersion: database.verno,
    exportedAt: new Date().toISOString(),
    includesPhotos: opts.includePhotos,
    tables,
  };
}

const backupSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  includesPhotos: z.boolean(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type ParseResult =
  | { ok: true; backup: BackupFile; counts: Record<string, number> }
  | { ok: false; error: string };

export function parseBackup(text: string, database: FitPilotDB = defaultDb): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: t.errors.backupNotJson };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: t.errors.backupNotFitpilot };
  const backup = parsed.data as BackupFile;

  if (backup.schemaVersion > database.verno) {
    return { ok: false, error: t.errors.backupNewer };
  }
  const known = new Set(database.tables.map((t) => t.name));
  const unknown = Object.keys(backup.tables).filter((n) => !known.has(n));
  if (unknown.length) return { ok: false, error: fmt(t.errors.backupUnknownTables, { names: unknown.join(', ') }) };

  const profiles = backup.tables.profile ?? [];
  if (profiles.length > 1) return { ok: false, error: t.errors.backupManyProfiles };
  for (const p of profiles) {
    const res = profileSchema.safeParse(p);
    if (!res.success) return { ok: false, error: t.errors.backupBadProfile };
  }
  for (const [name, rows] of Object.entries(backup.tables)) {
    for (const row of rows) {
      if ('date' in row && !(typeof row.date === 'string' && isValidISODate(row.date))) {
        return { ok: false, error: fmt(t.errors.backupBadDate, { name }) };
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(backup.tables)) counts[name] = rows.length;
  return { ok: true, backup, counts };
}

/**
 * Remplace toutes les données par celles de la sauvegarde (transaction unique : tout ou rien).
 * Les clés API actuelles sont conservées. Si la sauvegarde n'inclut pas les photos,
 * les photos actuelles sont conservées.
 */
export async function importData(backup: BackupFile, database: FitPilotDB = defaultDb): Promise<void> {
  const current = await getSettings(database);
  await database.transaction('rw', database.tables, async () => {
    // Requêtes lancées en parallèle dans la même transaction (toujours tout ou rien) :
    // évite un aller-retour par table, très coûteux sur certains WebKit.
    await Promise.all(
      database.tables
        .filter((table) => table.name !== 'progressPhotos' || backup.includesPhotos)
        .map(async (table) => {
          await table.clear();
          const rows = backup.tables[table.name];
          if (rows?.length) await table.bulkAdd(rows.map(decodeRow));
        }),
    );
  });
  const keep: Partial<typeof current> = {};
  for (const key of SECRET_SETTINGS) if (current[key]) keep[key] = current[key];
  await updateSettings(keep, database);
}

export function backupFileName(date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `fitpilot-sauvegarde-${d}.json`;
}

/**
 * Propose le fichier via la feuille de partage iOS si possible (Enregistrer dans Fichiers,
 * AirDrop…), sinon déclenche un téléchargement classique.
 */
export async function shareOrDownload(content: string | Blob, fileName: string, type = 'application/json'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([content], fileName, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export { BACKUP_REMINDER_DAYS, needsBackupReminder } from './backupReminder';
