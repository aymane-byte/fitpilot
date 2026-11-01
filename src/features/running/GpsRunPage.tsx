import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, Pause, Play, Satellite, Smartphone, Square, Timer, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { Toggle } from '@/components/Toggle';
import { updateSettings } from '@/db/db';
import { PageHeader } from '@/components/PageHeader';
import { Card, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { todayISO, toISODate } from '@/lib/dates';
import { formatDuration, formatPace, paceSecPerKm } from '@/lib/running';
import { RUN_TYPES, type RunTypeKey } from '@/lib/runTypes';
import { totalDistance } from '@/lib/geo';
import { builtinWorkouts, stepLabel, type FlatStep } from '@/lib/guided';
import { spokenDistance } from '@/lib/voice';
import { saveRun } from './service';
import { useGpsTracker, useWakeLock } from './useGpsTracker';
import { useRunInsights } from './useRunInsights';
import { useRunVoice } from './useRunVoice';
import { speak, speechSupported, unlockSpeech, voicePrefs } from './speech';
import { customToDef, resolveWorkout } from './workouts';

const RunMap = lazy(() => import('../maps/RunMap'));
import { PocketMode } from './PocketMode';
import { gapLabel } from '@/lib/liveRun';
const gp = t.gpsRun;
const x = t.runx;
const WORKOUT_KEY = 'fitpilot-gps-workout';

function storedWorkout(): string | null {
  try {
    return localStorage.getItem(WORKOUT_KEY);
  } catch {
    return null;
  }
}
function storeWorkout(key: string | null) {
  try {
    if (key) localStorage.setItem(WORKOUT_KEY, key);
    else localStorage.removeItem(WORKOUT_KEY);
  } catch {
    /* mode privé : la séance n'est pas restaurée après un rechargement */
  }
}

export function GpsRunPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const settings = useSettings();
  const gps = useGpsTracker({ autoPause: settings?.autoPause !== false });
  const insights = useRunInsights();
  const customs = useLiveQuery(() => db.runWorkouts.toArray());
  const wake = useWakeLock(gps.status === 'running' || gps.status === 'paused');
  const [workoutKey, setWorkoutKey] = useState<string | null>(() => params.get('seance') ?? (gps.status !== 'idle' ? storedWorkout() : null));
  const workout = customs && insights ? resolveWorkout(workoutKey, insights.paces, customs) : null;
  const [type, setType] = useState<RunTypeKey | null>(null);
  const runType: RunTypeKey = type ?? workout?.runType ?? 'easy';
  const [discarding, setDiscarding] = useState(false);
  const [picking, setPicking] = useState(false);
  // Course interrompue retrouvée : on demande quoi faire (reprendre, enregistrer, supprimer).
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [pocket, setPocket] = useState(false);
  // Brouillon chargé depuis IndexedDB : en pause → on demande quoi faire ; en cours → reprise auto.
  const askedRecover = useRef(false);
  useEffect(() => {
    if (!gps.loaded || askedRecover.current) return;
    askedRecover.current = true;
    if (gps.recovered && gps.status === 'paused') setRecoverOpen(true);
  }, [gps.loaded, gps.recovered, gps.status]);
  const prefs = useMemo(() => voicePrefs(settings?.voice), [settings?.voice]);

  // Annonce vocale de la pause et de la reprise automatiques.
  const wasAuto = useRef(gps.autoPaused);
  useEffect(() => {
    if (wasAuto.current === gps.autoPaused) return;
    wasAuto.current = gps.autoPaused;
    if (prefs.enabled && gps.status === 'running') speak(gps.autoPaused ? t.gpsx.autoPauseSpeech : t.gpsx.autoResumeSpeech);
  }, [gps.autoPaused, gps.status, prefs.enabled]);

  const km = gps.distanceM / 1000;
  const avgPace = km > 0.05 ? paceSecPerKm(km, gps.elapsedSec) : 0;
  // Allure « actuelle » : sur les ~30 dernières secondes de points.
  const recent = gps.points.filter((p) => p.seg === gps.seg && p.t >= (gps.points.at(-1)?.t ?? 0) - 30_000);
  const recentM = totalDistance(recent);
  const recentSec = recent.length >= 2 ? (recent.at(-1)!.t - recent[0].t) / 1000 : 0;
  const currentPace = recentM > 10 ? recentSec / (recentM / 1000) : 0;

  const guide = useRunVoice({ status: gps.status, elapsedSec: gps.elapsedSec, distanceM: gps.distanceM, currentPace, avgPace, prefs, workout });

  function start() {
    // iOS : la voix doit être débloquée par un toucher.
    unlockSpeech();
    storeWorkout(workoutKey);
    gps.start();
  }

  async function save() {
    if (gps.distanceM < 100) {
      toast(gp.tooShort, 'error');
      return;
    }
    const date = gps.startedAt ? toISODate(new Date(gps.startedAt)) : todayISO();
    const id = await saveRun(
      { date, type: runType, distanceKm: Math.round(km * 100) / 100, durationSec: Math.max(1, gps.elapsedSec), source: 'gps', startedAt: gps.points[0]?.t ?? gps.startedAt, workoutName: workout?.name },
      gps.points,
      { defaultShoe: true },
    );
    gps.reset();
    storeWorkout(null);
    toast(t.run.saved);
    navigate(`/course/${id}`, { replace: true });
  }

  const weak = gps.accuracy !== null && gps.accuracy > 25;
  const st = guide.status;

  return (
    <>
      <PageHeader title={gp.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-40">
        {gps.error && (
          <Notice tone="warning" icon={<TriangleAlert size={16} />}>
            {gps.error === 'denied' ? gp.denied : gp.unavailable}
          </Notice>
        )}
        {gps.status === 'idle' && (
          <div role="note" className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-sm font-semibold text-warning" data-testid="start-warning">
            <Lock size={18} className="mt-0.5 shrink-0" />
            {t.gpsr.startWarn}
          </div>
        )}
        {gps.recovered && gps.status === 'running' && <Notice>{t.gpsr.resumedAuto}</Notice>}
        {gps.suspendedSec !== null && gps.status === 'running' && !gps.pendingGap && (
          <Notice tone="warning" icon={<TriangleAlert size={16} />}>
            {fmt(t.gpsr.suspended, { d: gapLabel(gps.suspendedSec) })}
          </Notice>
        )}
        {gps.pendingGap && (
          <Card className="!p-4 border-warning/50" data-testid="gap-card">
            <p className="font-semibold text-warning">{fmt(t.gpsr.gapTitle, { d: gapLabel(gps.pendingGap.sec) })}</p>
            <p className="mt-1 text-sm text-muted">{fmt(t.gpsr.gapText, { m: `${num(gps.pendingGap.distanceM / 1000, 2)} km` })}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={gps.keepGap}>
                {t.gpsr.gapKeep}
              </Button>
              <Button variant="secondary" onClick={gps.removeGap}>
                {t.gpsr.gapRemove}
              </Button>
            </div>
          </Card>
        )}
        {(gps.status === 'running' || gps.status === 'paused') && (
          <div role="note" className="flex items-center gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm font-semibold text-warning" data-testid="keep-on">
            <Smartphone size={18} className="shrink-0" />
            <span className="min-w-0 flex-1">{t.gpsx.keepOn}</span>
            <Button size="sm" onClick={() => setPocket(true)} className="shrink-0">
              {t.gpsr.pocket}
            </Button>
          </div>
        )}

        {gps.status === 'idle' && (
          <Card className="!p-3.5">
            <Toggle label={t.gpsx.autoPause} hint={t.gpsx.autoPauseHint} checked={settings?.autoPause !== false} onChange={(autoPause) => updateSettings({ autoPause })} />
          </Card>
        )}

        {gps.status === 'idle' && (
          <Card className="!p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted">{x.guided}</p>
                <p className="truncate font-semibold" data-testid="gps-workout">{workout?.name ?? x.freeRun}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPicking(true)} icon={<Timer size={16} />}>
                {workout ? x.change : x.choose}
              </Button>
            </div>
          </Card>
        )}

        {st && gps.status !== 'idle' && <StepCard steps={guide.steps} index={guide.engine.index} step={st.step} remaining={st.remaining} progress={st.progress} feedback={guide.feedback} />}

        <Card className={`!p-5 text-center ${gps.autoPaused ? 'border-warning/50' : ''}`}>
          {gps.autoPaused && (
            <p className="mb-3 rounded-xl bg-warning/15 px-3 py-2 text-sm font-semibold text-warning" role="status" data-testid="auto-paused">
              {t.gpsx.autoPaused} · <span className="font-normal">{t.gpsx.autoPausedHint}</span>
            </p>
          )}
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{t.gpsx.time}</p>
          <p className="num text-7xl font-bold leading-none tracking-tight" data-testid="gps-time">
            {formatDuration(gps.elapsedSec)}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-2 px-2 py-3">
              <p className="text-xs text-muted">{t.run.distance}</p>
              <p className="num text-4xl font-bold tracking-tight" data-testid="gps-distance">
                {num(km, 2)}
                <span className="ml-1 text-base font-medium text-muted">km</span>
              </p>
            </div>
            <div className="rounded-2xl bg-surface-2 px-2 py-3">
              <p className="text-xs text-muted">{t.run.currentPace}</p>
              <p className="num text-4xl font-bold tracking-tight">
                {gps.autoPaused ? '–:––' : formatPace(currentPace || avgPace)}
                <span className="ml-1 text-base font-medium text-muted">/km</span>
              </p>
            </div>
          </div>
          <p className="num mt-2 text-sm text-muted">
            {t.run.avgPace} {formatPace(avgPace)} /km
          </p>
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
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          {prefs.enabled && speechSupported() ? <Volume2 size={14} /> : <VolumeX size={14} />}
          {prefs.enabled && speechSupported() ? `${x.voiceOn}. ${x.voiceLocked}` : speechSupported() ? x.voiceOff : x.voiceUnsupported}
        </p>

        {gps.points.length > 0 && (
          <Suspense fallback={<div className="h-72 rounded-2xl bg-surface-2" />}>
            <RunMap points={gps.points} live className="h-72" />
          </Suspense>
        )}

        {(gps.status === 'idle' || gps.status === 'stopped') && (
          <Segmented layout="grid" label={gp.type} value={runType} onChange={setType} options={RUN_TYPES.map((v) => ({ value: v, label: t.run.types[v] }))} />
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-xl pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg gap-2">
          {gps.status === 'idle' && (
            <Button size="lg" block className="min-h-16 text-lg" onClick={start} disabled={gps.error !== null} icon={<Play size={24} fill="currentColor" />}>
              {gp.start}
            </Button>
          )}
          {gps.status === 'running' && (
            <>
              <Button size="lg" variant="secondary" className="min-h-16 flex-1 text-lg" onClick={gps.pause} icon={<Pause size={24} />}>
                {gp.pause}
              </Button>
              <Button size="lg" variant="danger" className="min-h-16 flex-1 text-lg" onClick={gps.stop} icon={<Square size={22} />}>
                {gp.stop}
              </Button>
            </>
          )}
          {gps.status === 'paused' && (
            <>
              <Button size="lg" className="min-h-16 flex-1 text-lg" onClick={gps.resume} icon={<Play size={24} fill="currentColor" />}>
                {gp.resume}
              </Button>
              <Button size="lg" variant="danger" className="min-h-16 flex-1 text-lg" onClick={gps.stop} icon={<Square size={22} />}>
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
      {pocket && (gps.status === 'running' || gps.status === 'paused') && <PocketMode elapsedSec={gps.elapsedSec} distanceM={gps.distanceM} wake={wake} onExit={() => setPocket(false)} />}
      <Sheet open={recoverOpen} onClose={() => setRecoverOpen(false)} title={t.gpsx.recoverTitle}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{fmt(t.gpsx.recoverText, { km: num(km, 2), time: formatDuration(gps.elapsedSec) })}</p>
          <Button size="lg" block onClick={() => { unlockSpeech(); gps.resume(); setRecoverOpen(false); }} icon={<Play size={20} fill="currentColor" />}>
            {t.gpsx.recoverResume}
          </Button>
          <Button size="lg" block variant="secondary" onClick={() => { gps.stop(); setRecoverOpen(false); }} icon={<Square size={18} />}>
            {t.gpsx.recoverSave}
          </Button>
          <Button size="lg" block variant="danger" onClick={() => { setRecoverOpen(false); setDiscarding(true); }}>
            {t.gpsx.recoverDiscard}
          </Button>
        </div>
      </Sheet>
      <Sheet open={picking} onClose={() => setPicking(false)} title={x.guided}>
        <div className="flex flex-col gap-2">
          {[{ key: '', name: x.freeRun, description: '' }, ...builtinWorkouts(insights?.paces), ...(customs ?? []).map(customToDef)].map((w) => (
            <button
              key={w.key || 'free'}
              type="button"
              onClick={() => {
                setWorkoutKey(w.key || null);
                setType(null);
                setPicking(false);
              }}
              className={`rounded-2xl border p-3 text-left ${(workoutKey ?? '') === w.key ? 'border-accent-text bg-accent-soft' : 'border-line bg-surface-2 active:bg-line'}`}
            >
              <span className="block font-semibold">{w.name}</span>
              {w.description && <span className="block text-sm text-muted">{w.description}</span>}
            </button>
          ))}
        </div>
      </Sheet>
      <ConfirmSheet
        open={discarding}
        onClose={() => setDiscarding(false)}
        title={gp.discard}
        danger
        confirmLabel={t.common.delete}
        onConfirm={() => {
          gps.reset();
          storeWorkout(null);
          navigate('/course', { replace: true });
        }}
      >
        {gp.discardConfirm}
      </ConfirmSheet>
    </>
  );
}

function StepCard({ steps, index, step, remaining, progress, feedback }: { steps: FlatStep[]; index: number; step: FlatStep | null; remaining: number; progress: number; feedback: 'fast' | 'slow' | 'ok' | null }) {
  if (!step) {
    return (
      <Card className="!p-4" data-testid="step-card">
        <p className="font-semibold text-accent-text">{x.workoutFinished}</p>
      </Card>
    );
  }
  const next = steps[index + 1];
  const fbCls = feedback === 'ok' ? 'bg-accent text-accent-ink' : feedback ? 'bg-warning/15 text-warning' : '';
  return (
    <Card className="!p-4" data-testid="step-card">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-bold">{stepLabel(step)}</p>
        <p className="num text-xs text-muted">{fmt(x.stepOf, { n: index + 1, total: steps.length })}</p>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-muted">{x.remaining}</p>
          <p className="num text-3xl font-bold" data-testid="step-remaining">
            {step.by === 'time' ? formatDuration(remaining) : spokenDistance(remaining).replace(' mètres', ' m').replace(/ kilomètres?/, ' km')}
          </p>
        </div>
        {step.pace && (
          <div className="text-right">
            <p className="text-[11px] text-muted">{x.target}</p>
            <p className="num text-xl font-semibold">{formatPace(step.pace)} {t.run.perKm}</p>
          </div>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {feedback && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-semibold ${fbCls}`} role="status">
          {feedback === 'fast' ? x.tooFast : feedback === 'slow' ? x.tooSlow : x.onPace}
        </p>
      )}
      {next && <p className="mt-2 text-xs text-muted">{fmt(x.next, { label: `${stepLabel(next)} · ${next.by === 'time' ? formatDuration(next.value) : spokenDistance(next.value)}` })}</p>}
    </Card>
  );
}
