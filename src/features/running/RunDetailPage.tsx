import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Map as MapIcon, Timer, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import { latestWeight, useProfile, useWeightEntries } from '@/hooks/useData';
import { num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { kmSplits } from '@/lib/geo';
import { formatDuration, formatPace, paceSecPerKm, runCaloriesEstimate, speedKmh } from '@/lib/running';
import { deleteRun } from './service';

const RouteMap = lazy(() => import('./RouteMap'));
const r = t.run;

export function RunDetailPage() {
  const { id } = useParams();
  const runId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const weights = useWeightEntries();
  const [deleting, setDeleting] = useState(false);
  const run = useLiveQuery(async () => (await db.runs.get(runId)) ?? null, [runId]);
  const points = useLiveQuery(() => db.runPoints.where('runId').equals(runId).sortBy('t'), [runId]);

  if (run === undefined || !points) return null;
  if (run === null) {
    return (
      <>
        <PageHeader title={r.title} back />
        <main className="mx-auto max-w-lg px-4"><Notice>{r.notFound}</Notice></main>
      </>
    );
  }

  const pace = paceSecPerKm(run.distanceKm, run.durationSec);
  const splits = kmSplits(points);
  const weight = profile ? latestWeight(profile, weights) : undefined;
  const stats = [
    [r.distance, `${num(run.distanceKm, 2)} km`],
    [r.durationLabel, formatDuration(run.durationSec)],
    [r.pace, `${formatPace(pace)} ${r.perKm}`],
    [r.speed, `${num(speedKmh(run.distanceKm, run.durationSec))} ${r.kmh}`],
  ];

  return (
    <>
      <PageHeader title={r.types[run.type]} subtitle={formatDateFr(run.date, { weekday: 'long', day: 'numeric', month: 'long' })} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <div className="grid grid-cols-2 gap-2">
          {stats.map(([label, value]) => (
            <Card key={label} className="!p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="num text-xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
        {weight && (
          <p className="text-sm text-muted">
            {r.calories} : <span className="num font-semibold text-fg">≈ {runCaloriesEstimate(weight, run.distanceKm)} kcal</span> ({r.caloriesEstimate})
          </p>
        )}
        <Card>
          <CardTitle icon={<MapIcon size={18} />}>{r.route}</CardTitle>
          {points.length > 1 ? (
            <Suspense fallback={<div className="h-64 rounded-2xl bg-surface-2" />}>
              <RouteMap points={points} />
            </Suspense>
          ) : (
            <p className="text-sm text-muted">{r.noRoute}</p>
          )}
        </Card>
        {splits.length > 0 && (
          <Card>
            <CardTitle icon={<Timer size={18} />}>{r.splits}</CardTitle>
            <ul className="divide-y divide-line">
              {splits.map((s, i) => (
                <li key={i} className="num flex justify-between py-2 text-sm">
                  <span className="text-muted">km {i + 1}</span>
                  <span className="font-semibold">{formatPace(s)} {r.perKm}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {run.notes && (
          <Card>
            <CardTitle>{r.notes}</CardTitle>
            <p className="whitespace-pre-line text-[15px]">{run.notes}</p>
          </Card>
        )}
        <Button variant="danger" block onClick={() => setDeleting(true)} icon={<Trash2 size={18} />}>
          {r.delete}
        </Button>
      </main>
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={r.delete}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await deleteRun(runId);
          toast(t.gym.deleted);
          navigate('/course', { replace: true });
        }}
      >
        {r.deleteConfirm}
      </ConfirmSheet>
    </>
  );
}
