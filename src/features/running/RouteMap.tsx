import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cssVar } from '@/hooks/useTheme';
import type { PaceLine } from '@/lib/runAnalysis';

/** Rapide → lent (vert → rouge), lisible sur le fond de carte OpenStreetMap clair. */
export const PACE_COLORS = ['#1a9850', '#91cf60', '#e6c229', '#fc8d59', '#d73027'];

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function baseMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([33.57, -7.59], 13);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  return map;
}

/**
 * Carte OpenStreetMap avec le tracé (un trait par segment). `follow` recentre sur le dernier point.
 * `colored` : tracé coloré par allure (remplace le trait uni).
 */
export default function RouteMap({ points, follow, colored, className = 'h-64' }: { points: { lat: number; lng: number; seg?: number }[]; follow?: boolean; colored?: PaceLine[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = baseMap(el.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!points.length) return;
    const color = cssVar('--accent-text') || '#c6ff3d';
    if (colored?.length) {
      for (const line of colored) L.polyline(line.points, { color: PACE_COLORS[line.bucket] ?? color, weight: 5, opacity: 0.95 }).addTo(g);
    } else {
      const segs = new Map<number, L.LatLngExpression[]>();
      for (const p of points) segs.set(p.seg ?? 0, [...(segs.get(p.seg ?? 0) ?? []), [p.lat, p.lng]]);
      for (const line of segs.values()) L.polyline(line, { color, weight: 5, opacity: 0.9 }).addTo(g);
    }
    const first = points[0];
    const last = points.at(-1)!;
    L.circleMarker([first.lat, first.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }).addTo(g);
    L.circleMarker([last.lat, last.lng], { radius: 7, color: '#fff', weight: 2, fillColor: colored?.length ? '#111' : color, fillOpacity: 1 }).addTo(g);
    if (follow) m.setView([last.lat, last.lng], Math.max(m.getZoom(), 16));
    else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [24, 24] });
  }, [points, follow, colored]);

  return <div ref={el} className={`z-0 overflow-hidden rounded-2xl bg-surface-2 ${className}`} />;
}
