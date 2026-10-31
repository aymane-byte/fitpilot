import { describe, expect, it } from 'vitest';
import { autoPauseDecide, cropTrack, distanceToLine, matchesRoute, previewLength, trackPreview, type RawFix } from './track';

const dLat = (m: number) => m / 111_195;
/** Positions brutes : `speed` m/s vers le nord, une par seconde. */
function fixes(n: number, speed: number, t0 = 0, lat0 = 33.5, accuracy = 5): RawFix[] {
  return Array.from({ length: n }, (_, i) => ({ t: t0 + i * 1000, lat: lat0 + dLat(speed * i), lng: -7.6, accuracy }));
}
function line(n: number, speed = 3, dt = 2, lat0 = 33.5, lng = -7.6) {
  return Array.from({ length: n }, (_, i) => ({ t: i * dt * 1000, lat: lat0 + dLat(speed * dt * i), lng, accuracy: 5, seg: 0 }));
}

describe('pause automatique', () => {
  it('en mouvement : pas de pause', () => {
    expect(autoPauseDecide(fixes(15, 3), false, null)).toBeNull();
  });
  it('arrêt au feu rouge : pause datée au début de l’immobilité', () => {
    const moving = fixes(20, 3);
    const last = moving.at(-1)!;
    // 12 s immobile, avec ±2 m de bruit GPS.
    const still = Array.from({ length: 12 }, (_, i) => ({ t: last.t + (i + 1) * 1000, lat: last.lat + dLat(i % 2 ? 2 : -2), lng: -7.6, accuracy: 6 }));
    const d = autoPauseDecide([...moving, ...still], false, null);
    expect(d?.action).toBe('pause');
    expect(d!.at).toBeGreaterThanOrEqual(last.t);
    expect(d!.at).toBeLessThanOrEqual(last.t + 3000);
  });
  it('début de course ou signal trop court : pas de décision', () => {
    expect(autoPauseDecide(fixes(5, 0), false, null)).toBeNull();
    expect(autoPauseDecide([], false, null)).toBeNull();
  });
  it('positions imprécises ignorées (pas de fausse reprise)', () => {
    const anchor = { lat: 33.5, lng: -7.6 };
    const noisy = [{ t: 0, lat: 33.5 + dLat(40), lng: -7.6, accuracy: 60 }];
    expect(autoPauseDecide(noisy, true, anchor)).toBeNull();
  });
  it('reprise quand on repart à plus de 12 m du point d’arrêt', () => {
    const anchor = { lat: 33.5, lng: -7.6 };
    expect(autoPauseDecide(fixes(3, 2), true, anchor)).toBeNull(); // 4 m
    expect(autoPauseDecide(fixes(8, 2), true, anchor)).toEqual({ action: 'resume', at: 7000 }); // 14 m
  });
});

describe('mini-tracé et parcours favoris', () => {
  it('tracé allégé sous la limite de points', () => {
    const zig = line(2000).map((p, i) => ({ ...p, lng: -7.6 + (i % 40 < 20 ? 0 : 0.0004) }));
    const pv = trackPreview(zig, 80);
    expect(pv.length).toBeLessThanOrEqual(80);
    expect(pv.length).toBeGreaterThan(2);
    expect(trackPreview(line(1))).toEqual([]);
  });
  it('distance à une ligne', () => {
    const l: [number, number][] = [[33.5, -7.6], [33.51, -7.6]];
    expect(distanceToLine({ lat: 33.505, lng: -7.6 }, l)).toBeLessThan(1);
    expect(distanceToLine({ lat: 33.505, lng: -7.6 + 0.001 }, l)).toBeCloseTo(92.7, -1);
  });
  it('même parcours reconnu ; raccourci, détour ou autre rue refusés', () => {
    const route = trackPreview(line(500)); // 3 km
    const len = previewLength(route);
    expect(len).toBeCloseTo(2994, -1);
    // Même trajet, GPS décalé de 15 m.
    const same = trackPreview(line(500, 3, 2, 33.5, -7.6 + 0.00016));
    expect(matchesRoute(route, same, len)).toBe(true);
    // Moitié du parcours seulement.
    expect(matchesRoute(route, trackPreview(line(250)), len / 2)).toBe(false);
    // Rue parallèle à 300 m.
    expect(matchesRoute(route, trackPreview(line(500, 3, 2, 33.5, -7.6 + 0.0032)), len)).toBe(false);
    // Bonne distance mais tracé différent (aller-retour sur la première moitié).
    const outBack = [...line(250), ...line(250).reverse()].map((p, i) => ({ ...p, t: i * 2000 }));
    expect(matchesRoute(route, trackPreview(outBack), len)).toBe(false);
    // Ligne droite 11 % plus longue (tracé allégé à 2 points) : le bout qui dépasse est vu.
    expect(matchesRoute(route, trackPreview(line(555)), len * 1.11)).toBe(true);
    expect(matchesRoute(route, trackPreview(line(600)), len * 1.2)).toBe(false);
  });
});

describe('recadrage', () => {
  it('garde la portion choisie et recalcule distance et temps', () => {
    const pts = line(501); // 3 000 m, 1 000 s
    const c = cropTrack(pts, 500, 2500);
    expect(Math.abs(c.distanceM - 2000)).toBeLessThan(15);
    expect(Math.abs(c.durationSec - 667)).toBeLessThan(5);
    expect(c.points[0].lat).toBeGreaterThan(pts[0].lat);
    expect(cropTrack(pts, 0, 3000).points).toHaveLength(501);
  });
});
