import { lazy, Suspense, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Card';
import { Segmented } from '@/components/Segmented';
import { db } from '@/db/db';
import { fmt, t } from '@/i18n';
import { addDays, todayISO } from '@/lib/dates';

// MapLibre n'est chargé que sur cet écran.
const HeatMap = lazy(() => import('../maps/HeatMap'));
const x = t.runx;
type Range = 'all' | '12m' | '3m';

/** Carte de chaleur de toutes les courses GPS, à partir des tracés allégés (rapide). */
export function HeatmapPage() {
  const [range, setRange] = useState<Range>('all');
  const since = range === 'all' ? '0000-00-00' : addDays(todayISO(), range === '12m' ? -365 : -92);
  const tracks = useLiveQuery(async () => {
    const runs = await db.runs.where('date').aboveOrEqual(since).toArray();
    return runs.filter((r) => r.preview && r.preview.length > 1).map((r) => r.preview!.map(([lat, lng]) => [lng, lat] as [number, number]));
  }, [since]);

  return (
    <>
      <PageHeader title={x.mapTitle} subtitle={tracks ? fmt(x.mapCount, { n: tracks.length }) : undefined} back />
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
        {tracks && tracks.length === 0 ? (
          <Notice>{x.mapEmpty}</Notice>
        ) : (
          tracks && (
            <Suspense fallback={<div className="h-[65dvh] rounded-2xl bg-surface-2" />}>
              <HeatMap tracks={tracks} />
            </Suspense>
          )
        )}
        {tracks && tracks.length > 0 && <p className="text-xs text-muted">{x.mapNote}</p>}
      </main>
    </>
  );
}
