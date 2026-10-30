// VDOT (Jack Daniels & Jimmy Gilbert, « Oxygen Power », 1979) : estimation de la VO2max
// « effective » à partir d'une performance, et prédictions de temps sur d'autres distances.
// Ce sont des ESTIMATIONS : elles supposent un effort maximal et un entraînement adapté à la distance.

/** Coût en oxygène (ml/kg/min) à la vitesse v (m/min). */
export function vo2AtSpeed(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction de la VO2max soutenable pendant t minutes. */
export function fractionSustainable(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

export function vdot(distanceM: number, timeSec: number): number {
  if (distanceM <= 0 || timeSec <= 0) return 0;
  const tMin = timeSec / 60;
  return vo2AtSpeed(distanceM / tMin) / fractionSustainable(tMin);
}

/** Temps prédit (s) sur `distanceM` pour un VDOT donné (recherche par dichotomie). */
export function predictTime(v: number, distanceM: number): number {
  let lo = distanceM / 500; // 30 km/h
  let hi = distanceM / 1.5; // marche lente
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distanceM, mid) > v) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Vitesse (m/min) pour laquelle le coût en O2 vaut `vo2` (inverse de vo2AtSpeed). */
function speedForVo2(vo2: number): number {
  const a = 0.000104, b = 0.182258, c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Allure (s/km) correspondant à `fraction` × VDOT. */
export function paceAtFraction(v: number, fraction: number): number {
  return Math.round(60_000 / speedForVo2(v * fraction));
}

export interface TrainingPaces {
  /** Plage d'allure footing (lent → rapide), s/km. */
  easy: [number, number];
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
}

/** Allures d'entraînement approximatives (pourcentages de VDOT inspirés des tables de Daniels). */
export function trainingPaces(v: number): TrainingPaces {
  return {
    easy: [paceAtFraction(v, 0.62), paceAtFraction(v, 0.72)],
    marathon: Math.round(predictTime(v, 42_195) / 42.195),
    threshold: paceAtFraction(v, 0.88),
    interval: paceAtFraction(v, 0.975),
    repetition: paceAtFraction(v, 1.06),
  };
}

export const PREDICTION_DISTANCES = [
  { key: '5k', label: '5 km', m: 5000 },
  { key: '10k', label: '10 km', m: 10_000 },
  { key: 'half', label: 'Semi-marathon', m: 21_097.5 },
  { key: 'marathon', label: 'Marathon', m: 42_195 },
] as const;

export interface Performance {
  distanceM: number;
  sec: number;
  date: string;
  runId?: number;
  /** Libellé de la source (ex. « 5 km », « course entière »). */
  label: string;
}

/**
 * Meilleur VDOT parmi les performances récentes. Seuls les efforts de 1 500 m à 42,2 km
 * et d'au moins 3 min 30 sont retenus (domaine de validité de la formule).
 */
export function bestVdot(perfs: Performance[], since?: string): { vdot: number; from: Performance } | null {
  let best: { vdot: number; from: Performance } | null = null;
  for (const p of perfs) {
    if (since && p.date < since) continue;
    if (p.distanceM < 1500 || p.distanceM > 42_500 || p.sec < 210) continue;
    const v = vdot(p.distanceM, p.sec);
    // Au-delà de 85, c'est un niveau olympique : donnée probablement erronée.
    if (v > 85 || v < 15) continue;
    if (!best || v > best.vdot) best = { vdot: Math.round(v * 10) / 10, from: p };
  }
  return best;
}

const EFFORT_LABELS: Record<string, string> = { '1mi': '1 mile', '5k': '5 km', '10k': '10 km', half: 'semi-marathon' };
const EFFORT_M: Record<string, number> = { '1mi': 1609.344, '5k': 5000, '10k': 10_000, half: 21_097.5 };

/**
 * Performances utilisables pour le VDOT : meilleurs efforts GPS (1 mile → semi) et courses
 * entières d'au moins 3 km (le meilleur VDOT l'emporte, une sortie facile ne le fait pas baisser).
 */
export function performancesFromRuns(
  runs: { id?: number; date: string; distanceKm: number; durationSec: number; bestEfforts?: Partial<Record<string, number>> }[],
  wholeRunLabel: (km: number) => string = (km) => `course entière de ${km} km`,
): Performance[] {
  const out: Performance[] = [];
  for (const r of runs) {
    for (const [key, sec] of Object.entries(r.bestEfforts ?? {})) {
      if (sec && EFFORT_M[key]) out.push({ distanceM: EFFORT_M[key], sec, date: r.date, runId: r.id, label: EFFORT_LABELS[key] });
    }
    if (r.distanceKm >= 3) out.push({ distanceM: r.distanceKm * 1000, sec: r.durationSec, date: r.date, runId: r.id, label: wholeRunLabel(Math.round(r.distanceKm * 10) / 10) });
  }
  return out;
}
