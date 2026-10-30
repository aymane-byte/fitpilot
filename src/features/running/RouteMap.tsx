import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cssVar } from '@/hooks/useTheme';

/** Carte OpenStreetMap avec le tracé (un trait par segment). `follow` recentre sur le dernier point. */
export default function RouteMap({ points, follow, className = 'h-64' }: { points: { lat: number; lng: number; seg?: number }[]; follow?: boolean; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([33.57, -7.59], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
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
    const segs = new Map<number, L.LatLngExpression[]>();
    for (const p of points) segs.set(p.seg ?? 0, [...(segs.get(p.seg ?? 0) ?? []), [p.lat, p.lng]]);
    for (const line of segs.values()) L.polyline(line, { color, weight: 5, opacity: 0.9 }).addTo(g);
    const first = points[0];
    const last = points.at(-1)!;
    L.circleMarker([first.lat, first.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }).addTo(g);
    L.circleMarker([last.lat, last.lng], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(g);
    if (follow) m.setView([last.lat, last.lng], Math.max(m.getZoom(), 16));
    else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [24, 24] });
  }, [points, follow]);

  return <div ref={el} className={`z-0 overflow-hidden rounded-2xl bg-surface-2 ${className}`} />;
}
