// Altitude : lissage du bruit GPS et dénivelé positif / négatif.
//
// L'altitude GPS d'un téléphone est bruitée (souvent ±5 à 15 m d'un point à l'autre).
// Additionner toutes les petites variations donnerait des centaines de mètres de D+
// sur un parcours plat. On procède donc en trois temps :
//  1. combler les trous (points sans altitude) par interpolation ;
//  2. filtre médian (supprime les pics isolés) puis moyenne glissante ;
//  3. hystérésis : une montée ou descente n'est comptée qu'une fois que l'altitude repart
//     dans l'autre sens d'au moins un seuil (les oscillations du bruit sont ignorées).

/** Seuil d'hystérésis (m) : GPS du téléphone, et modèle numérique de terrain (plus propre). */
export const ELEV_THRESHOLD = { gps: 5, dem: 1 } as const;

/** Remplit les altitudes manquantes par interpolation linéaire (extrémités : valeur la plus proche). */
export function fillGaps(alts: (number | undefined | null)[]): number[] | null {
  const known = alts.map((a, i) => (typeof a === 'number' && Number.isFinite(a) ? i : -1)).filter((i) => i >= 0);
  if (!known.length) return null;
  const out = new Array<number>(alts.length);
  for (let k = 0; k < known.length; k++) {
    const i = known[k];
    out[i] = alts[i] as number;
    const next = known[k + 1];
    if (next !== undefined) {
      for (let j = i + 1; j < next; j++) out[j] = out[i] + (((alts[next] as number) - out[i]) * (j - i)) / (next - i);
    }
  }
  for (let j = 0; j < known[0]; j++) out[j] = alts[known[0]] as number;
  for (let j = known.at(-1)! + 1; j < alts.length; j++) out[j] = alts[known.at(-1)!] as number;
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Filtre médian puis moyenne glissante, fenêtre centrée de `window` points (impair). */
export function smoothAltitudes(alts: number[], window = 5): number[] {
  const half = Math.max(0, Math.floor(window / 2));
  const pass = (src: number[], fn: (v: number[]) => number) =>
    src.map((_, i) => fn(src.slice(Math.max(0, i - half), Math.min(src.length, i + half + 1))));
  const med = pass(alts, median);
  return pass(med, (v) => v.reduce((s, x) => s + x, 0) / v.length);
}

/**
 * Dénivelé par hystérésis sur les extrêmes : une montée (ou descente) est validée quand
 * l'altitude repart en sens inverse d'au moins `threshold` mètres ; on compte alors toute
 * l'amplitude du creux au sommet (rien n'est perdu au seuil). La dernière montée/descente
 * en cours est comptée à la fin si elle dépasse le seuil.
 * Renvoie le total et, pour chaque point, le D+ / D− attribué (pour les splits par km).
 */
export function elevationEvents(alts: number[], threshold: number = ELEV_THRESHOLD.gps) {
  const n = alts.length;
  const gainAt = new Array<number>(n).fill(0);
  const lossAt = new Array<number>(n).fill(0);
  if (n < 2) return { gain: 0, loss: 0, gainAt, lossAt };
  // Répartit un tronçon monotone validé sur ses points (somme = amplitude du tronçon).
  const commit = (from: number, to: number, dir: 1 | -1) => {
    let ref = alts[from];
    for (let i = from + 1; i <= to; i++) {
      const d = (alts[i] - ref) * dir;
      if (d > 0) {
        (dir === 1 ? gainAt : lossAt)[i] += d;
        ref = alts[i];
      }
    }
  };
  let dir: 0 | 1 | -1 = 0;
  let lo = 0;
  let hi = 0;
  let start = 0;
  let ext = 0;
  for (let i = 1; i < n; i++) {
    const a = alts[i];
    if (dir === 0) {
      if (a < alts[lo]) lo = i;
      if (a > alts[hi]) hi = i;
      if (a - alts[lo] >= threshold) [dir, start, ext] = [1, lo, i];
      else if (alts[hi] - a >= threshold) [dir, start, ext] = [-1, hi, i];
    } else if (dir === 1) {
      if (a >= alts[ext]) ext = i;
      else if (alts[ext] - a >= threshold) {
        commit(start, ext, 1);
        [dir, start, ext] = [-1, ext, i];
      }
    } else {
      if (a <= alts[ext]) ext = i;
      else if (a - alts[ext] >= threshold) {
        commit(start, ext, -1);
        [dir, start, ext] = [1, ext, i];
      }
    }
  }
  if (dir !== 0 && Math.abs(alts[ext] - alts[start]) >= threshold) commit(start, ext, dir);
  const gain = gainAt.reduce((s, v) => s + v, 0);
  const loss = lossAt.reduce((s, v) => s + v, 0);
  return { gain: Math.round(gain), loss: Math.round(loss), gainAt, lossAt };
}

/** Altitudes brutes → altitudes lissées (null si aucune altitude disponible). */
export function cleanAltitudes(alts: (number | undefined | null)[], source: 'gps' | 'dem' = 'gps'): number[] | null {
  const filled = fillGaps(alts);
  if (!filled) return null;
  // Le modèle de terrain est déjà lisse : un léger lissage suffit.
  return smoothAltitudes(filled, source === 'gps' ? 7 : 3);
}

/** Proportion de points ayant une altitude (sert à décider s'il faut appeler l'API d'élévation). */
export function altitudeCoverage(alts: (number | undefined | null)[]): number {
  if (!alts.length) return 0;
  return alts.filter((a) => typeof a === 'number' && Number.isFinite(a)).length / alts.length;
}
