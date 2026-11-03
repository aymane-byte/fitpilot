// Charge d'entraînement (course) : forme / fatigue / fraîcheur, modèle de Banister
// (« impulse-response ») tel que popularisé par TrainingPeaks (CTL / ATL / TSB).
//
// 1. Chaque course reçoit un score de charge (comparable au TSS / rTSS) :
//      charge = durée (h) × IF² × 100
//    IF (facteur d'intensité) = intensité relative au seuil (1,0 = 1 h à fond).
//    IF vient, par ordre de priorité :
//      - de l'effort ressenti (RPE 1–10) si tu l'as noté : IF = 0,5 + 0,06 × RPE ;
//      - de l'allure par rapport à ton allure seuil (estimée par le VDOT) : IF = allure seuil / allure ;
//      - sinon d'une valeur par défaut selon le type de course.
// 2. Forme (CTL) = moyenne exponentielle de la charge sur ~42 jours.
//    Fatigue (ATL) = moyenne exponentielle sur ~7 jours.
//    Fraîcheur (TSB) = forme − fatigue de la veille.
// Sans cardio, l'intensité est approximative : c'est une ESTIMATION de tendance, pas une mesure.
import { addDays, daysBetween, type ISODate } from './dates';

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

export const TYPE_IF: Record<string, number> = { recovery: 0.65, easy: 0.72, long: 0.75, tempo: 0.88, intervals: 0.92, walk: 0.45, hike: 0.6, bike: 0.62 };

export interface LoadRun {
  date: ISODate;
  durationSec: number;
  distanceKm: number;
  type?: string;
  /** Effort ressenti 1–10. */
  rpe?: number;
}

export type IfBasis = 'rpe' | 'pace' | 'type';

export function intensityFactor(run: LoadRun, thresholdPaceSec?: number): { value: number; basis: IfBasis } {
  if (run.rpe && run.rpe >= 1 && run.rpe <= 10) return { value: Math.round((0.5 + 0.06 * run.rpe) * 100) / 100, basis: 'rpe' };
  // Allure comparée au seuil de course : n'a de sens que pour la course à pied.
  if (thresholdPaceSec && run.distanceKm > 0 && run.durationSec > 0 && (!run.type || TYPE_IF[run.type] === undefined || ['easy', 'tempo', 'intervals', 'long', 'recovery'].includes(run.type))) {
    const pace = run.durationSec / run.distanceKm;
    return { value: Math.round(Math.min(1.2, Math.max(0.5, thresholdPaceSec / pace)) * 100) / 100, basis: 'pace' };
  }
  return { value: TYPE_IF[run.type ?? 'easy'] ?? 0.72, basis: 'type' };
}

/** Score de charge d'une course (≈ rTSS). */
export function runLoad(run: LoadRun, thresholdPaceSec?: number): number {
  const { value } = intensityFactor(run, thresholdPaceSec);
  return Math.round((run.durationSec / 3600) * value * value * 100);
}

export interface LoadDay {
  date: ISODate;
  load: number;
  ctl: number;
  atl: number;
  /** Fraîcheur du jour = CTL − ATL de la veille (avant la séance du jour). */
  tsb: number;
}

/**
 * Série quotidienne de la charge, de la première course (au plus `maxDays` jours avant)
 * jusqu'à `today`. Les valeurs démarrent à 0 : il faut ~6 semaines d'historique pour une forme fiable.
 */
export function trainingLoadSeries(runs: LoadRun[], today: ISODate, thresholdPaceSec?: number, maxDays = 365): LoadDay[] {
  if (!runs.length) return [];
  const byDay = new Map<string, number>();
  for (const r of runs) byDay.set(r.date, (byDay.get(r.date) ?? 0) + runLoad(r, thresholdPaceSec));
  const first = runs.reduce((m, r) => (r.date < m ? r.date : m), runs[0].date);
  const start = daysBetween(first, today) > maxDays ? addDays(today, -maxDays) : first;
  const out: LoadDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const load = byDay.get(d) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
    out.push({ date: d, load, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round(tsb * 10) / 10 });
  }
  return out;
}

export type FormZone = 'fresh' | 'transition' | 'neutral' | 'optimal' | 'overload';

/** Interprétation de la fraîcheur (seuils usuels de TrainingPeaks, en points de charge). */
export function formZone(tsb: number): FormZone {
  if (tsb > 25) return 'transition'; // très reposé : la forme baisse
  if (tsb > 5) return 'fresh';
  if (tsb >= -10) return 'neutral';
  if (tsb >= -30) return 'optimal'; // fatigue productive
  return 'overload';
}

/** Hausse de la forme sur 7 jours (rampe) : au-delà de ~8 points/semaine, risque de blessure accru. */
export function rampRate(series: LoadDay[]): number | null {
  if (series.length < 8) return null;
  return Math.round((series.at(-1)!.ctl - series.at(-8)!.ctl) * 10) / 10;
}
