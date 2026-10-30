// Course : allure, vitesse, durées, calories estimées, records.

/** Allure en secondes par km. */
export function paceSecPerKm(distanceKm: number, durationSec: number): number {
  if (distanceKm <= 0) return 0;
  return durationSec / distanceKm;
}

export function speedKmh(distanceKm: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.round((distanceKm / (durationSec / 3600)) * 10) / 10;
}

/** « 5:23 » (min:s par km). */
export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '–:––';
  let total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  total -= m * 60;
  return `${m}:${String(total).padStart(2, '0')}`;
}

/** « 32:10 » ou « 1:02:30 ». */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(r).padStart(2, '0')}` : `${mm}:${String(r).padStart(2, '0')}`;
}

/** Accepte « 32 » (minutes), « 32:10 », « 1:02:30 ». Renvoie des secondes ou undefined. */
export function parseDuration(input: string): number | undefined {
  const s = input.trim();
  if (!s) return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return undefined;
  const parts = s.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return undefined;
  let sec: number;
  if (parts.length === 1) sec = parts[0] * 60;
  else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  else sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return sec > 0 ? sec : undefined;
}

/**
 * Calories estimées : ~1 kcal par kg et par km (règle classique pour la course à pied).
 * C'est une ESTIMATION : elle dépend du terrain, du vent, de l'efficacité de foulée.
 */
export function runCaloriesEstimate(weightKg: number, distanceKm: number): number {
  return Math.round(weightKg * distanceKm);
}

export interface RunLike {
  id?: number;
  date: string;
  distanceKm: number;
  durationSec: number;
  /** Meilleurs temps mesurés par GPS sur ces distances (secondes), si disponibles. */
  bestEfforts?: Partial<Record<RecordDistance, number>>;
}

export type RecordDistance = '1k' | '5k' | '10k';
export const RECORD_KM: Record<RecordDistance, number> = { '1k': 1, '5k': 5, '10k': 10 };

export interface RunRecord {
  sec: number;
  runId?: number;
  date: string;
  /** true si mesuré par GPS sur un segment ; false si déduit de l'allure moyenne de la sortie. */
  measured: boolean;
}

/**
 * Records 1 km / 5 km / 10 km : meilleur segment GPS si disponible,
 * sinon allure moyenne × distance pour une sortie au moins aussi longue.
 */
export function runRecords(runs: RunLike[]): Partial<Record<RecordDistance, RunRecord>> & { longest?: RunLike } {
  const out: Partial<Record<RecordDistance, RunRecord>> & { longest?: RunLike } = {};
  for (const r of runs) {
    if (!out.longest || r.distanceKm > out.longest.distanceKm) out.longest = r;
    for (const key of Object.keys(RECORD_KM) as RecordDistance[]) {
      const km = RECORD_KM[key];
      const measured = r.bestEfforts?.[key];
      let candidate: RunRecord | undefined;
      if (measured) candidate = { sec: measured, runId: r.id, date: r.date, measured: true };
      else if (r.distanceKm >= km && r.distanceKm > 0) candidate = { sec: Math.round((r.durationSec / r.distanceKm) * km), runId: r.id, date: r.date, measured: false };
      if (candidate && (!out[key] || candidate.sec < out[key]!.sec)) out[key] = candidate;
    }
  }
  return out;
}

export function sumDistance(runs: { distanceKm: number }[]): number {
  return Math.round(runs.reduce((s, r) => s + r.distanceKm, 0) * 100) / 100;
}
