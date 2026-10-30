import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Card';
import { Segmented } from '@/components/Segmented';
import { db } from '@/db/db';
import type { RunPoint } from '@/db/types';
import { fmt, t } from '@/i18n';
import { addDays, todayISO } from '@/lib/dates';
import { simplify } from '@/lib/runAnalysis';
import { baseMap } from './RouteMap';

const x = t.runx;
type Range = 'all' | '12m' | '3m';

/**
 * Carte de chaleur : chaque course est tracée en trait semi-transparent ; les tracés
 * superposés (parcours fréquents) deviennent plus lumineux. Rendu canvas pour la fluidité.
 */
export function HeatmapPage() {
  const [range, setRange] = useState<Range>('all');
  const since = range === 'all' ? '0000-00-00' : addDays(todayISO(), range === '12m' ? -365 : -92);
  const data = useLiveQuery(async () => {
    const runs = await db.runs.where('date').aboveOrEqual(since).toArray();
    const ids = new Set(runs.map((r) => r.id!));
    const pts = await db.runPoints.where('runId').anyOf([...ids]).toArray();
    const byRun = new Map<number, RunPoint[]>();
    for (const p of pts) byRun.set(p.runId, [...(byRun.get(p.runId) ?? []), p]);
    return [...byRun.values()].filter((p) => p.length > 1).map((p) => simplify(p.sort((a, b) => a.t - b.t), 6));
  }, [since]);

  return (
    <>
      <PageHeader title={x.mapTitle} subtitle={data ? fmt(x.mapCount, { n: data.length }) : undefined} back />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-28">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 'all', label: x.mapAll },
            { value: '12m', label: x.map12 },
            { value: '3m', label: x.map3 },
          ]}
        />
        {data && data.length === 0 ? <Notice>{x.mapEmpty}</Notice> : data && <Heat tracks={data} />}
        {data && data.length > 0 && <p className="text-xs text-muted">{x.mapNote}</p>}
      </main>
    </>
  );
}

function Heat({ tracks }: { tracks: RunPoint[][] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);

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
    const all: [number, number][] = [];
    for (const tr of tracks) {
      const segs = new Map<number, [number, number][]>();
      for (const p of tr) {
        const ll: [number, number] = [p.lat, p.lng];
        segs.set(p.seg ?? 0, [...(segs.get(p.seg ?? 0) ?? []), ll]);
        all.push(ll);
      }
      // Halo large + trait fin : l'accumulation donne l'effet « chaleur ».
      for (const line of segs.values()) {
        L.polyline(line, { renderer, color: '#ff5a1f', weight: 7, opacity: 0.12, interactive: false }).addTo(g);
        L.polyline(line, { renderer, color: '#ffb000', weight: 2.5, opacity: 0.45, interactive: false }).addTo(g);
      }
    }
    if (all.length) m.fitBounds(L.latLngBounds(all), { padding: [20, 20] });
  }, [tracks, renderer]);

  return <div ref={el} data-testid="heatmap" className="z-0 h-[65dvh] overflow-hidden rounded-2xl bg-surface-2" />;
}
