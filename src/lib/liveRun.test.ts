import { describe, expect, it } from 'vitest';
import { detectGaps, elapsedMs, estimatedDistanceM, gapLabel, pauseClock, removeGap, resumeClock } from './liveRun';
import { movingTime, totalDistance } from './geo';

const T0 = Date.parse('2026-11-01T07:00:00Z');
const dLat = (m: number) => m / 111_195;

describe('chrono basé sur les horodatages (horloge simulée)', () => {
  it('le temps est juste même sans aucun « tick » pendant 10 min (app suspendue)', () => {
    const c = { activeMs: 0, resumedAt: T0 };
    // Aucun setInterval n'a tourné : on recalcule directement à T0 + 10 min.
    expect(elapsedMs(c, T0 + 600_000)).toBe(600_000);
  });
  it('pauses et reprises', () => {
    let c = { activeMs: 0, resumedAt: T0 as number | null };
    c = pauseClock(c, T0 + 120_000); // 2 min de course
    expect(elapsedMs(c, T0 + 300_000)).toBe(120_000); // en pause : figé
    c = resumeClock(c, T0 + 300_000);
    expect(elapsedMs(c, T0 + 360_000)).toBe(180_000);
    expect(resumeClock(c, T0 + 999_999)).toEqual(c); // reprise en double ignorée
  });
  it('horloge qui recule (réglage de l’heure) : jamais de temps négatif', () => {
    expect(elapsedMs({ activeMs: 5000, resumedAt: T0 }, T0 - 60_000)).toBe(5000);
  });
});

describe('trous GPS (positions simulées)', () => {
  // 2 min de course à 3 m/s, écran verrouillé 6 min (≈ 1 km parcouru), puis 1 min.
  const before = Array.from({ length: 121 }, (_, i) => ({ t: T0 + i * 1000, lat: 33.5 + dLat(3 * i), lng: -7.6, accuracy: 5, seg: 0 }));
  const last = before.at(-1)!;
  const after = Array.from({ length: 61 }, (_, i) => ({ t: last.t + 360_000 + i * 1000, lat: last.lat + dLat(1000 + 3 * i), lng: -7.6, accuracy: 5, seg: 0 }));
  const pts = [...before, ...after];

  it('trou détecté : durée et distance en ligne droite', () => {
    const gaps = detectGaps(pts);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ index: 121, sec: 360 });
    expect(gaps[0].distanceM).toBeGreaterThan(990);
    expect(gaps[0].distanceM).toBeLessThan(1010);
    expect(estimatedDistanceM(pts)).toBe(gaps[0].distanceM);
    expect(gapLabel(360)).toBe('6 min');
    expect(gapLabel(3900)).toBe('1 h 05');
    expect(gapLabel(40)).toBe('40 s');
  });
  it('signal normal ou pause volontaire : pas de trou', () => {
    expect(detectGaps(before)).toEqual([]);
    const paused = [...before, ...after.map((p) => ({ ...p, seg: 1 }))];
    expect(detectGaps(paused)).toEqual([]);
  });
  it('garder : ligne droite comptée ; retirer : distance et temps du trou exclus', () => {
    const kept = totalDistance(pts);
    const removed = removeGap(pts, 121);
    expect(kept - totalDistance(removed)).toBeGreaterThan(990);
    expect(movingTime(pts) - movingTime(removed)).toBe(360);
    expect(detectGaps(removed)).toEqual([]);
    // Les segments suivants sont décalés (pas de fusion avec un segment existant).
    expect(removed[121].seg).toBe(1);
    expect(removed[0].seg).toBe(0);
  });
});
