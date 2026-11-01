import { describe, expect, it } from 'vitest';
import { nearestInfo, PACE_SCALE, routeGeo, type RoutePoint } from './routeGeo';

const dLat = (m: number) => m / 111_195;
function line(n: number, speed: number, t0 = 0, lat0 = 33.5): RoutePoint[] {
  return Array.from({ length: n }, (_, i) => ({ t: t0 + i * 2000, lat: lat0 + dLat(speed * 2 * i), lng: -7.6, accuracy: 5, seg: 0, alt: 20 + i * 0.1 }));
}

describe('géométrie de carte', () => {
  const fast = line(201, 5); // 2 km rapides
  const slow = line(201, 2.5, fast.at(-1)!.t + 2000, fast.at(-1)!.lat + dLat(5)); // 1 km lent
  const pts = [...fast, ...slow];
  it('couleurs selon l’allure, marqueurs de km, cadrage', () => {
    const g = routeGeo(pts);
    expect(g.lines[0].properties.color).toBe(PACE_SCALE[0]);
    expect(g.lines.at(-1)!.properties.color).toBe(PACE_SCALE.at(-1));
    expect(g.kmMarks.map((k) => k.km)).toEqual([1, 2, 3]);
    expect(g.kmMarks[0].lat).toBeCloseTo(33.5 + dLat(1000), 5);
    expect(g.start).toEqual([-7.6, 33.5]);
    expect(g.bounds![1][1]).toBeCloseTo(pts.at(-1)!.lat, 6);
    expect(g.gaps).toEqual([]);
  });
  it('sans couleur : un trait par segment', () => {
    const g = routeGeo([...fast.slice(0, 50), ...fast.slice(50).map((p) => ({ ...p, seg: 1 }))], false);
    expect(g.lines).toHaveLength(2);
  });
  it('trou GPS : pointillés séparés, pas coloré comme une allure', () => {
    const gapPts = [...fast.slice(0, 100), ...fast.slice(100).map((p, i) => ({ ...p, t: p.t + 300_000, ...(i === 0 ? { gapBefore: true } : {}) }))];
    const g = routeGeo(gapPts);
    expect(g.gaps).toHaveLength(1);
    expect(g.gaps[0].properties.index).toBe(100);
    // Aucun morceau coloré ne relie les deux côtés du trou.
    const joins = g.lines.filter((l) => l.geometry.coordinates.some((c) => c[1] === gapPts[99].lat) && l.geometry.coordinates.some((c) => c[1] === gapPts[100].lat));
    expect(joins).toEqual([]);
  });
  it('toucher le tracé : distance, allure et altitude à cet endroit', () => {
    const info = nearestInfo(pts, { lat: 33.5 + dLat(500), lng: -7.6 + 0.00005 })!;
    expect(info.km).toBeCloseTo(0.5, 1);
    expect(info.paceSec).toBe(200); // 5 m/s = 3:20 /km
    expect(info.alt).toBe(25);
    const onSlow = nearestInfo(pts, { lat: slow[100].lat, lng: -7.6 })!;
    expect(onSlow.paceSec).toBe(400);
    expect(nearestInfo([], { lat: 0, lng: 0 })).toBeNull();
  });
});
