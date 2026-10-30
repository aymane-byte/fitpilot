import { z } from 'zod';
import { db } from '@/db/db';
import type { Run, RunType } from '@/db/types';
import { t } from '@/i18n';
import { isoDate } from '@/lib/schemas';
import { fastestSegment, type GeoPoint } from '@/lib/geo';
import { RECORD_KM, type RecordDistance } from '@/lib/running';
import { RUN_TYPES } from '@/lib/runTypes';

/** Allure minimale crédible : 2:30 /km (plus rapide que le record du monde du 1 500 m). */
const MIN_PACE_SEC = 150;

export const runEntrySchema = z
  .object({
    date: isoDate,
    type: z.enum(RUN_TYPES),
    distanceKm: z.number({ error: t.run.errDistance }).min(0.1, t.run.errDistance).max(300, t.run.errDistance),
    durationSec: z.number({ error: t.run.errDuration }).int().positive(t.run.errDuration).max(48 * 3600, t.run.errDuration),
    notes: z.string().max(500).optional(),
  })
  .refine((r) => r.durationSec / r.distanceKm >= MIN_PACE_SEC, { message: t.run.errPace, path: ['durationSec'] });

export type RunEntry = z.infer<typeof runEntrySchema>;

export function bestEffortsFromPoints(points: GeoPoint[]): Run['bestEfforts'] {
  const out: Run['bestEfforts'] = {};
  for (const key of Object.keys(RECORD_KM) as RecordDistance[]) {
    const sec = fastestSegment(points, RECORD_KM[key] * 1000);
    if (sec) out[key] = sec;
  }
  return out;
}

/** Enregistre une course (et ses points GPS) ; coche la course prévue ce jour-là. */
export async function saveRun(entry: RunEntry & { source: Run['source'] }, points: GeoPoint[] = []): Promise<number> {
  return (await db.transaction('rw', [db.runs, db.runPoints, db.scheduledActivities], async () => {
    const planned = await db.scheduledActivities.where('date').equals(entry.date).filter((a) => a.kind === 'run' && a.status === 'planned').first();
    const runId = (await db.runs.add({
      ...entry,
      type: entry.type as RunType,
      bestEfforts: points.length ? bestEffortsFromPoints(points) : undefined,
      scheduledId: planned?.id,
      createdAt: Date.now(),
    })) as number;
    if (points.length) await db.runPoints.bulkAdd(points.map((p) => ({ runId, t: p.t, lat: p.lat, lng: p.lng, accuracy: p.accuracy, seg: p.seg })));
    if (planned) await db.scheduledActivities.update(planned.id!, { status: 'done' });
    return runId;
  })) as number;
}

export async function deleteRun(runId: number) {
  await db.transaction('rw', db.runs, db.runPoints, async () => {
    await db.runPoints.where('runId').equals(runId).delete();
    await db.runs.delete(runId);
  });
}
