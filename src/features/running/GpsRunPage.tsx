import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Pause, Play, Satellite, Square, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { useToast } from '@/components/Toast';
import { fmt, num, t } from '@/i18n';
import { todayISO, toISODate } from '@/lib/dates';
import { formatDuration, formatPace, paceSecPerKm } from '@/lib/running';
import { RUN_TYPES, type RunTypeKey } from '@/lib/runTypes';
import { totalDistance } from '@/lib/geo';
import { saveRun } from './service';
import { useGpsTracker, useWakeLock } from './useGpsTracker';

const RouteMap = lazy(() => import('./RouteMap'));
const gp = t.gpsRun;

export function GpsRunPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const gps = useGpsTracker();
  const wake = useWakeLock(gps.status === 'running' || gps.status === 'paused');
  const [type, setType] = useState<RunTypeKey>('easy');
  const [discarding, setDiscarding] = useState(false);

  const km = gps.distanceM / 1000;
  const avgPace = km > 0.05 ? paceSecPerKm(km, gps.elapsedSec) : 0;
  // Allure « actuelle » : sur les ~30 dernières secondes de points.
  const recent = gps.points.filter((p) => p.seg === gps.seg && p.t >= (gps.points.at(-1)?.t ?? 0) - 30_000);
  const recentM = totalDistance(recent);
  const recentSec = recent.length >= 2 ? (recent.at(-1)!.t - recent[0].t) / 1000 : 0;
  const currentPace = recentM > 10 ? recentSec / (recentM / 1000) : 0;

  async function save() {
    if (gps.distanceM < 100) {
      toast(gp.tooShort, 'error');
      return;
    }
    const date = gps.startedAt ? toISODate(new Date(gps.startedAt)) : todayISO();
    const id = await saveRun({ date, type, distanceKm: Math.round(km * 100) / 100, durationSec: Math.max(1, gps.elapsedSec), source: 'gps' }, gps.points);
    gps.reset();
    toast(t.run.saved);
    navigate(`/course/${id}`, { replace: true });
  }

  const weak = gps.accuracy !== null && gps.accuracy > 25;

  return (
    <>
      <PageHeader title={gp.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-40">
        {gps.error && (
          <Notice tone="warning" icon={<TriangleAlert size={16} />}>
            {gps.error === 'denied' ? gp.denied : gp.unavailable}
          </Notice>
        )}
        {gps.recovered && gps.status === 'paused' && <Notice tone="warning">{gp.recovered}</Notice>}
        {gps.status === 'idle' && (
          <Notice icon={<Lock size={16} />}>{gp.honest}</Notice>
        )}

        <Card className="!p-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{t.run.distance}</p>
          <p className="num text-6xl font-bold tracking-tight" data-testid="gps-distance">
            {num(km, 2)}
            <span className="ml-1 text-xl font-medium text-muted">km</span>
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label={t.run.durationLabel} value={formatDuration(gps.elapsedSec)} />
            <Metric label={t.run.currentPace} value={formatPace(currentPace || avgPace)} />
            <Metric label={t.run.avgPace} value={formatPace(avgPace)} />
          </div>
          <p className={`mt-4 flex items-center justify-center gap-1.5 text-xs ${weak ? 'text-warning' : 'text-muted'}`}>
            <Satellite size={14} />
            {gps.accuracy === null ? gp.waiting : fmt(gp.accuracy, { m: gps.accuracy })}
            {gps.status === 'paused' && <span className="ml-2 font-semibold text-warning">· {gp.paused}</span>}
          </p>
          {weak && <p className="mt-1 text-xs text-warning">{gp.weak}</p>}
          {gps.rejected > 0 && <p className="mt-1 text-xs text-muted">{fmt(gp.rejected, { n: gps.rejected })}</p>}
        </Card>

        {gps.status !== 'idle' && (
          <p className={`text-center text-xs ${wake === 'on' ? 'text-muted' : 'text-warning'}`}>{wake === 'on' ? gp.wakeLockOn : wake === 'unsupported' ? gp.wakeLockOff : ''}</p>
        )}

        {gps.points.length > 0 && (
          <Suspense fallback={<div className="h-64 rounded-2xl bg-surface-2" />}>
            <RouteMap points={gps.points} follow={gps.status === 'running'} />
          </Suspense>
        )}

        {(gps.status === 'idle' || gps.status === 'stopped') && (
          <Segmented layout="grid" label={gp.type} value={type} onChange={setType} options={RUN_TYPES.map((v) => ({ value: v, label: t.run.types[v] }))} />
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-xl pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg gap-2">
          {gps.status === 'idle' && (
            <Button size="lg" block onClick={gps.start} disabled={gps.error !== null} icon={<Play size={20} fill="currentColor" />}>
              {gp.start}
            </Button>
          )}
          {gps.status === 'running' && (
            <>
              <Button size="lg" variant="secondary" className="flex-1" onClick={gps.pause} icon={<Pause size={20} />}>
                {gp.pause}
              </Button>
              <Button size="lg" variant="danger" className="flex-1" onClick={gps.stop} icon={<Square size={18} />}>
                {gp.stop}
              </Button>
            </>
          )}
          {gps.status === 'paused' && (
            <>
              <Button size="lg" className="flex-1" onClick={gps.resume} icon={<Play size={20} fill="currentColor" />}>
                {gp.resume}
              </Button>
              <Button size="lg" variant="danger" className="flex-1" onClick={gps.stop} icon={<Square size={18} />}>
                {gp.stop}
              </Button>
            </>
          )}
          {gps.status === 'stopped' && (
            <>
              <Button size="lg" variant="secondary" onClick={() => setDiscarding(true)}>
                {gp.discard}
              </Button>
              <Button size="lg" className="flex-1" onClick={save}>
                {gp.save}
              </Button>
            </>
          )}
        </div>
      </div>
      <ConfirmSheet open={discarding} onClose={() => setDiscarding(false)} title={gp.discard} danger confirmLabel={t.common.delete} onConfirm={() => { gps.reset(); navigate('/course', { replace: true }); }}>
        {gp.discardConfirm}
      </ConfirmSheet>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-2 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="num text-lg font-semibold">{value}</p>
    </div>
  );
}
