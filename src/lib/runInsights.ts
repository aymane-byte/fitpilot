// Synthèse course : VDOT récent, allures d'entraînement, charge (forme / fatigue / fraîcheur).
// Utilisée par l'écran Forme, les séances guidées, le tableau de bord et le coach.
import { addDays, type ISODate } from './dates';
import { formZone, intensityFactor, rampRate, trainingLoadSeries, type FormZone, type LoadDay } from './load';
import { bestVdot, performancesFromRuns, trainingPaces, type Performance, type TrainingPaces } from './vdot';

export interface InsightRun {
  id?: number;
  date: ISODate;
  type?: string;
  distanceKm: number;
  durationSec: number;
  rpe?: number;
  bestEfforts?: Partial<Record<string, number>>;
}

export interface RunInsights {
  vdot: { vdot: number; from: Performance } | null;
  paces: TrainingPaces | null;
  series: LoadDay[];
  today: LoadDay | null;
  zone: FormZone | null;
  ramp: number | null;
  basis: { rpe: number; pace: number; type: number };
}

/** VDOT sur les 6 derniers mois : au-delà, la forme a pu changer. */
export const VDOT_WINDOW_DAYS = 180;

export function runInsights(runs: InsightRun[], today: ISODate, wholeRunLabel?: (km: number) => string): RunInsights {
  const vd = bestVdot(performancesFromRuns(runs, wholeRunLabel), addDays(today, -VDOT_WINDOW_DAYS));
  const paces = vd ? trainingPaces(vd.vdot) : null;
  const threshold = paces?.threshold;
  const series = trainingLoadSeries(runs, today, threshold);
  const basis = { rpe: 0, pace: 0, type: 0 };
  for (const r of runs) basis[intensityFactor(r, threshold).basis]++;
  const last = series.at(-1) ?? null;
  return { vdot: vd, paces, series, today: last, zone: last ? formZone(last.tsb) : null, ramp: rampRate(series), basis };
}
