// Course en cours sauvegardée en continu dans IndexedDB (état + points ajoutés par lots).
// Plus robuste que localStorage (quota plus grand, écritures incrémentales) : si iOS ferme
// l'app ou si la page est rechargée, la course est retrouvée et reprend automatiquement.
import { db } from '@/db/db';
import type { LivePoint, LiveRunState } from '@/db/types';
import type { TrackPoint } from '@/lib/runAnalysis';

export interface LiveSnapshot {
  state: Omit<LiveRunState, 'id' | 'pointCount' | 'updatedAt'>;
  points: TrackPoint[];
}

const LEGACY_KEY = 'fitpilot-gps-draft';

/** Écrit l'état et les nouveaux points (depuis `flushed`). Renvoie le nombre de points écrits au total. */
export async function saveLive(snap: LiveSnapshot, flushed: number): Promise<number> {
  const fresh = snap.points.slice(flushed);
  await db.transaction('rw', db.liveRun, db.livePoints, async () => {
    if (fresh.length) await db.livePoints.bulkAdd(fresh.map(toLive));
    await db.liveRun.put({ id: 'current', ...snap.state, pointCount: snap.points.length, updatedAt: Date.now() });
  });
  return snap.points.length;
}

/** Réécrit tous les points (après une modification d'un point déjà écrit, ex. trou retiré). */
export async function rewriteLive(snap: LiveSnapshot): Promise<number> {
  await db.transaction('rw', db.liveRun, db.livePoints, async () => {
    await db.livePoints.clear();
    await db.livePoints.bulkAdd(snap.points.map(toLive));
    await db.liveRun.put({ id: 'current', ...snap.state, pointCount: snap.points.length, updatedAt: Date.now() });
  });
  return snap.points.length;
}

const toLive = (p: TrackPoint & { gapBefore?: boolean }): LivePoint => ({ t: p.t, lat: p.lat, lng: p.lng, accuracy: p.accuracy, seg: p.seg, ...(p.alt !== undefined ? { alt: p.alt } : {}), ...(p.gapBefore ? { gapBefore: true } : {}) });

export async function loadLive(): Promise<LiveSnapshot | null> {
  const state = await db.liveRun.get('current');
  if (state) {
    const pts = await db.livePoints.orderBy('t').toArray();
    const { id: _id, pointCount: _c, updatedAt: _u, ...rest } = state;
    return { state: rest, points: pts.map(({ id: _pid, ...p }) => p) };
  }
  // Ancien brouillon (versions précédentes, localStorage) : migré une fois.
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Omit<LiveSnapshot['state'], 'status'> & { points: TrackPoint[]; status: string };
    localStorage.removeItem(LEGACY_KEY);
    if (d.status === 'idle' || !d.points?.length) return null;
    const snap: LiveSnapshot = { state: { status: d.status as LiveRunState['status'], seg: d.seg, activeMs: d.activeMs, resumedAt: d.resumedAt, startedAt: d.startedAt, rejected: d.rejected }, points: d.points };
    await rewriteLive(snap);
    return snap;
  } catch {
    return null;
  }
}

export async function clearLive(): Promise<void> {
  await db.transaction('rw', db.liveRun, db.livePoints, async () => {
    await db.liveRun.clear();
    await db.livePoints.clear();
  });
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* rien */
  }
}
