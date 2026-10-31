import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudSun, Download, Map as MapIcon, Medal, Mountain, Pencil, Share2, Timer, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Segmented } from '@/components/Segmented';
import { TextArea } from '@/components/Field';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Toggle } from '@/components/Toggle';
import { LazyMultiLineChart } from '@/components/LazyTrendChart';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Run, RunType } from '@/db/types';
import { shareOrDownload } from '@/db/backup';
import { latestWeight, useProfile, useWeightEntries } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { movingTime } from '@/lib/geo';
import { detailedSplits, elevationProfile, paceLines, rankEfforts, type TrackPoint } from '@/lib/runAnalysis';
import { formatDuration, formatPace, paceSecPerKm, runCaloriesEstimate, speedKmh } from '@/lib/running';
import { heatAdvice, weatherLabel } from '@/lib/openMeteo';
import { buildGpx } from '@/lib/gpx';
import { RUN_TYPES } from '@/lib/runTypes';
import { deleteRun, enrichRun, updateRun } from './service';
import { RpePicker, ShoeSelect } from './RunControls';
import { PACE_COLORS } from './RouteMap';

const RouteMap = lazy(() => import('./RouteMap'));
const r = t.run;
const x = t.runx;

export function RunDetailPage() {
  const { id } = useParams();
  const runId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const weights = useWeightEntries();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [colored, setColored] = useState(true);
  const run = useLiveQuery(async () => (await db.runs.get(runId)) ?? null, [runId]);
  const points = useLiveQuery(() => db.runPoints.where('runId').equals(runId).sortBy('t'), [runId]);
  const allRuns = useLiveQuery(() => db.runs.toArray());
  const shoe = useLiveQuery(async () => (run?.shoeId ? ((await db.shoes.get(run.shoeId)) ?? null) : null), [run?.shoeId]);

  // Altitude et météo récupérées en ligne si elles manquent (une fois par ouverture).
  const enriched = useRef(false);
  useEffect(() => {
    if (!run || !points?.length || enriched.current) return;
    const missingElev = run.elevGainM === undefined;
    if (!missingElev && run.weather) return;
    enriched.current = true;
    void enrichRun(runId);
  }, [run, points, runId]);

  const analysis = useMemo(() => {
    if (!run || !points) return null;
    const src = run.elevSource ?? 'gps';
    return {
      splits: detailedSplits(points, src),
      profile: elevationProfile(points, src),
      pace: paceLines(points),
      moving: points.length > 1 ? movingTime(points) : 0,
    };
  }, [run, points]);

  if (run === undefined || !points || !analysis) return null;
  if (run === null) {
    return (
      <>
        <PageHeader title={r.title} back />
        <main className="mx-auto max-w-lg px-4"><Notice>{r.notFound}</Notice></main>
      </>
    );
  }

  const pace = paceSecPerKm(run.distanceKm, run.durationSec);
  const weight = profile ? latestWeight(profile, weights) : undefined;
  const ranks = allRuns ? rankEfforts(run, allRuns) : [];
  const hasTrack = points.length > 1;
  const stats: [string, string][] = [
    [r.distance, `${num(run.distanceKm, 2)} km`],
    [r.durationLabel, formatDuration(run.durationSec)],
    [r.pace, `${formatPace(pace)} ${r.perKm}`],
    [r.speed, `${num(speedKmh(run.distanceKm, run.durationSec))} ${r.kmh}`],
  ];
  if (run.elevGainM !== undefined) stats.push([x.elevation, `+${run.elevGainM} / −${run.elevLossM ?? 0} m`]);
  if (hasTrack && Math.abs(analysis.moving - run.durationSec) > 30) stats.push([x.moving, formatDuration(analysis.moving)]);

  async function exportGpx() {
    const name = run!.name ?? `${r.types[run!.type]} ${run!.date}`;
    const res = await shareOrDownload(buildGpx(name, points!), `fitpilot-${run!.date}-${run!.id}.gpx`, 'application/gpx+xml');
    if (res !== 'cancelled') toast(x.gpxExported);
  }

  return (
    <>
      <PageHeader
        title={run.name ?? r.types[run.type]}
        subtitle={formatDateFr(run.date, { weekday: 'long', day: 'numeric', month: 'long' })}
        back
        action={
          <button type="button" aria-label={t.common.edit} onClick={() => setEditing(true)} className="grid size-11 place-items-center rounded-full text-fg active:bg-surface-2">
            <Pencil size={20} />
          </button>
        }
      />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <div className="grid grid-cols-2 gap-2">
          {stats.map(([label, value]) => (
            <Card key={label} className="!p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="num text-xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          {weight && (
            <span>
              {r.calories} : <span className="num font-semibold text-fg">≈ {runCaloriesEstimate(weight, run.distanceKm)} kcal</span> ({r.caloriesEstimate})
            </span>
          )}
          {shoe && <span>{x.shoe} : <span className="font-medium text-fg">{shoe.name}</span></span>}
          {run.rpe && <span>{x.rpe} : <span className="font-medium text-fg">{run.rpe}/10</span></span>}
          {run.workoutName && <span>{fmt(x.workoutDone, { name: run.workoutName })}</span>}
          {run.importedFrom && <span>{fmt(x.imported, { format: run.importedFrom.toUpperCase() })}</span>}
        </div>

        {hasTrack && <WeatherCard run={run} />}

        <Card>
          <CardTitle icon={<MapIcon size={18} />}>{r.route}</CardTitle>
          {hasTrack ? (
            <>
              <Suspense fallback={<div className="h-64 rounded-2xl bg-surface-2" />}>
                <RouteMap points={points} colored={colored ? analysis.pace.lines : undefined} />
              </Suspense>
              {analysis.pace.lines.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  <Toggle label={x.paceMap} checked={colored} onChange={setColored} />
                  {colored && (
                    <div className="flex items-center gap-2 text-xs text-muted" aria-label={`${x.fast} ${formatPace(analysis.pace.fast)} – ${x.slow} ${formatPace(analysis.pace.slow)}`}>
                      <span className="num">{x.fast} {formatPace(analysis.pace.fast)}</span>
                      <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${PACE_COLORS.join(',')})` }} />
                      <span className="num">{formatPace(analysis.pace.slow)} {x.slow}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{r.noRoute}</p>
          )}
        </Card>

        {ranks.length > 0 && (
          <Card>
            <CardTitle icon={<Medal size={18} />}>{x.bestEfforts}</CardTitle>
            <ul className="divide-y divide-line">
              {ranks.map((e) => (
                <li key={e.key} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">{x.records[e.key]}</span>
                  <span className="flex items-center gap-2">
                    {e.rank <= 3 && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.rank === 1 ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-fg'}`}>
                        {e.rank === 1 ? x.pr : e.rank === 2 ? x.rank2 : x.rank3}
                      </span>
                    )}
                    <span className="num font-semibold">{formatDuration(e.sec)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {analysis.splits.length > 0 && <SplitsCard splits={analysis.splits} hasElev={run.elevGainM !== undefined} />}

        {hasTrack && (
          <Card>
            <CardTitle icon={<Mountain size={18} />}>{x.profile}</CardTitle>
            {analysis.profile.length > 1 && run.elevGainM !== undefined ? (
              <>
                <LazyMultiLineChart
                  height="h-36"
                  legend={false}
                  ariaLabel={x.profile}
                  labels={analysis.profile.map((p) => `${num(p.km, 1)} km`)}
                  series={[{ label: x.profile, values: analysis.profile.map((p) => p.alt), colorVar: '--info', fill: true }]}
                  format={(v) => `${Math.round(v)} m`}
                />
                <p className="mt-2 text-xs text-muted">{run.elevSource === 'dem' ? x.elevSourceDem : x.elevSourceGps}</p>
              </>
            ) : (
              <p className="text-sm text-muted">{x.elevFetching}</p>
            )}
          </Card>
        )}

        {run.notes && (
          <Card>
            <CardTitle>{r.notes}</CardTitle>
            <p className="whitespace-pre-line text-[15px]">{run.notes}</p>
          </Card>
        )}
        {hasTrack && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setSharing(true)} icon={<Share2 size={18} />}>
              {x.share}
            </Button>
            <Button variant="secondary" onClick={exportGpx} icon={<Download size={18} />}>
              {x.exportGpx}
            </Button>
          </div>
        )}
        <Button variant="danger" block onClick={() => setDeleting(true)} icon={<Trash2 size={18} />}>
          {r.delete}
        </Button>
      </main>
      {editing && <EditRunSheet run={run} onClose={() => setEditing(false)} />}
      {sharing && <ShareSheet run={run} points={points} onClose={() => setSharing(false)} />}
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

function WeatherCard({ run }: { run: Run }) {
  const w = run.weather;
  const advice = w ? heatAdvice(w) : null;
  return (
    <Card>
      <CardTitle icon={<CloudSun size={18} />}>{x.weather}</CardTitle>
      {w ? (
        <>
          <p className="text-[15px]">
            <span className="num text-xl font-semibold">{w.tempC} °C</span> · {weatherLabel(w.code)}
          </p>
          <p className="num text-sm text-muted">
            {[w.feelsC !== undefined && fmt(x.feels, { t: w.feelsC }), w.windKmh !== undefined && fmt(x.wind, { v: w.windKmh }), w.humidity !== undefined && fmt(x.humidity, { v: Math.round(w.humidity) }), w.precipMm ? fmt(x.rain, { v: num(w.precipMm) }) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {advice && <p className="mt-2 text-sm text-warning">{advice === 'hot' ? x.hot : x.warm}</p>}
          <p className="mt-2 text-xs text-muted">{x.weatherSource}</p>
        </>
      ) : (
        <p className="text-sm text-muted">{x.weatherPending}</p>
      )}
    </Card>
  );
}

function SplitsCard({ splits, hasElev }: { splits: ReturnType<typeof detailedSplits>; hasElev: boolean }) {
  const full = splits.filter((s) => !s.partial);
  const paces = (full.length ? full : splits).map((s) => s.paceSec);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  return (
    <Card>
      <CardTitle icon={<Timer size={18} />}>{r.splits}</CardTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 pr-3 font-medium">{x.splitsKm}</th>
            <th className="pb-2 font-medium">{x.splitsPace}</th>
            <th className="w-full pb-2" aria-hidden />
            <th className="pb-2 text-right font-medium">{x.splitsTime}</th>
            {hasElev && <th className="pb-2 pl-3 text-right font-medium">{x.splitsElev}</th>}
          </tr>
        </thead>
        <tbody className="num">
          {splits.map((s) => {
            // Barre : plus longue = plus rapide (comme Strava).
            const span = slowest - fastest || 1;
            const w = s.partial ? 0 : 35 + (65 * (slowest - s.paceSec)) / span;
            return (
              <tr key={s.index} className="border-t border-line">
                <td className="py-2 pr-3 text-muted">{s.partial ? num(s.distanceM / 1000, 2) : s.index}</td>
                <td className="py-2 pr-2 font-semibold">{formatPace(s.paceSec)}</td>
                <td className="py-2 pr-2">
                  {!s.partial && <span className="block h-2 rounded-full bg-accent-text/70" style={{ width: `${w}%` }} />}
                </td>
                <td className="py-2 text-right">{formatDuration(s.sec)}</td>
                {hasElev && (
                  <td className="whitespace-nowrap py-2 pl-3 text-right text-xs text-muted">
                    {s.gainM || s.lossM ? `${s.gainM ? `+${s.gainM}` : ''}${s.gainM && s.lossM ? ' ' : ''}${s.lossM ? `−${s.lossM}` : ''}` : '0'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function EditRunSheet({ run, onClose }: { run: Run; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<RunType>(run.type);
  const [shoeId, setShoeId] = useState(run.shoeId);
  const [rpe, setRpe] = useState(run.rpe);
  const [notes, setNotes] = useState(run.notes ?? '');
  return (
    <Sheet open onClose={onClose} title={t.common.edit}>
      <div className="flex flex-col gap-4">
        <Segmented layout="grid" label={x.editType} value={type} onChange={setType} options={RUN_TYPES.map((v) => ({ value: v, label: r.types[v] }))} />
        <ShoeSelect value={shoeId} onChange={setShoeId} />
        <RpePicker value={rpe} onChange={setRpe} />
        <TextArea label={r.notes} value={notes} onChange={setNotes} placeholder={r.notesPlaceholder} />
        <Button
          size="lg"
          block
          onClick={async () => {
            await updateRun(run.id!, { type, shoeId, rpe, notes: notes.trim() || undefined });
            toast(t.common.saved);
            onClose();
          }}
        >
          {t.common.save}
        </Button>
      </div>
    </Sheet>
  );
}

/** L'image est préparée à l'ouverture : sur iOS, le partage doit suivre directement le toucher. */
function ShareSheet({ run, points, onClose }: { run: Run; points: TrackPoint[]; onClose: () => void }) {
  const toast = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let made: string | undefined;
    void import('./shareImage').then(async (m) => {
      const b = await m.shareImageBlob(run, points);
      if (cancelled) return;
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [run, points]);
  return (
    <Sheet open onClose={onClose} title={x.share}>
      <div className="flex flex-col gap-3">
        {url ? <img src={url} alt={x.share} className="mx-auto max-h-[55dvh] rounded-2xl border border-line" /> : <div className="aspect-[4/5] w-full animate-pulse rounded-2xl bg-surface-2" />}
        <Button
          size="lg"
          block
          disabled={!blob}
          icon={<Share2 size={18} />}
          onClick={async () => {
            const res = await shareOrDownload(blob!, `fitpilot-course-${run.date}.png`, 'image/png');
            if (res !== 'cancelled') toast(x.shared);
          }}
        >
          {x.share}
        </Button>
      </div>
    </Sheet>
  );
}
