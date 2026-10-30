import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Gauge, Play, Plus, Timer, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { NumberField, TextField } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { RunType } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { builtinWorkouts, customWorkout, expandWorkout, workoutTotals, type GuidedWorkoutDef } from '@/lib/guided';
import { formatDuration, parsePace } from '@/lib/running';
import { useRunInsights } from './useRunInsights';
import { customToDef, targetKey } from './workouts';

const x = t.runx;

export function WorkoutsLibraryPage() {
  const navigate = useNavigate();
  const ins = useRunInsights();
  const customs = useLiveQuery(() => db.runWorkouts.toArray());
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState(false);
  if (!ins || !customs) return null;
  const start = (key: string) => navigate(`/course/gps?seance=${encodeURIComponent(key)}`);

  return (
    <>
      <PageHeader title={x.workoutsTitle} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <p className="text-sm text-muted">{x.workoutsIntro}</p>
        {ins.vdot ? <p className="text-sm">{fmt(x.pacesFrom, { v: num(ins.vdot.vdot) })}</p> : <Notice>{x.noPaces}</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setTarget(true)} icon={<Gauge size={18} />}>
            {x.targetPace}
          </Button>
          <Button variant="secondary" onClick={() => setCreating(true)} icon={<Plus size={18} />}>
            {x.newWorkout}
          </Button>
        </div>
        {customs.length > 0 && (
          <Card>
            <CardTitle icon={<Timer size={18} />}>{x.mine}</CardTitle>
            <ul className="flex flex-col gap-2">
              {customs.map((w) => (
                <WorkoutRow key={w.id} def={customToDef(w)} onStart={start} onDelete={() => db.runWorkouts.delete(w.id!)} />
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <CardTitle icon={<Timer size={18} />}>{x.builtin}</CardTitle>
          <ul className="flex flex-col gap-2">
            {builtinWorkouts(ins.paces).map((w) => (
              <WorkoutRow key={w.key} def={w} onStart={start} />
            ))}
          </ul>
        </Card>
      </main>
      {creating && <CustomSheet onClose={() => setCreating(false)} defaultPace={ins.paces?.interval} />}
      {target && <TargetSheet onClose={() => setTarget(false)} onStart={start} defaultPace={ins.paces?.threshold} />}
    </>
  );
}

function WorkoutRow({ def, onStart, onDelete }: { def: GuidedWorkoutDef; onStart: (key: string) => void; onDelete?: () => void }) {
  const tot = workoutTotals(expandWorkout(def));
  return (
    <li className="rounded-2xl bg-surface-2 p-3.5">
      <p className="font-semibold">{def.name}</p>
      {def.description && <p className="text-sm text-muted">{def.description}</p>}
      <p className="num mt-1 text-xs text-muted">{fmt(x.totals, { time: formatDuration(tot.sec), km: num(tot.meters / 1000) })}</p>
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => onStart(def.key)} icon={<Play size={16} fill="currentColor" />} aria-label={`${x.startWorkout} : ${def.name}`}>
          {x.startWorkout}
        </Button>
        {onDelete && (
          <Button size="sm" variant="secondary" onClick={onDelete} aria-label={`${x.deleteWorkout} : ${def.name}`} icon={<Trash2 size={16} />} />
        )}
      </div>
    </li>
  );
}

const fmtPace = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

function TargetSheet({ onClose, onStart, defaultPace }: { onClose: () => void; onStart: (key: string) => void; defaultPace?: number }) {
  const [km, setKm] = useState<number | undefined>(5);
  const [pace, setPace] = useState(fmtPace(defaultPace) || '5:30');
  const [tol, setTol] = useState<number | undefined>(8);
  const p = parsePace(pace);
  const ok = !!p && !!km && km > 0 && km <= 100 && tol !== undefined && tol >= 2 && tol <= 60;
  return (
    <Sheet open onClose={onClose} title={x.targetPaceTitle}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={x.targetDistance} unit="km" value={km} onChange={setKm} />
          <TextField label={x.paceInput} value={pace} onChange={setPace} inputMode="numeric" hint={x.paceInputHint} error={pace && !p ? x.errPace : undefined} />
        </div>
        <NumberField label={x.tolerance} unit="s" value={tol} onChange={setTol} integer hint={x.toleranceHint} />
        <Button size="lg" block disabled={!ok} onClick={() => onStart(targetKey(Math.round(km! * 1000), p!, tol))} icon={<Play size={18} fill="currentColor" />}>
          {x.startWorkout}
        </Button>
      </div>
    </Sheet>
  );
}

function CustomSheet({ onClose, defaultPace }: { onClose: () => void; defaultPace?: number }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [warmup, setWarmup] = useState<number | undefined>(10);
  const [reps, setReps] = useState<number | undefined>(6);
  const [by, setBy] = useState<'time' | 'distance'>('distance');
  const [work, setWork] = useState<number | undefined>(800);
  const [rec, setRec] = useState<number | undefined>(90);
  const [cool, setCool] = useState<number | undefined>(10);
  const [pace, setPace] = useState(fmtPace(defaultPace));
  const [error, setError] = useState<string>();
  const p = pace.trim() ? parsePace(pace) : undefined;

  async function save() {
    if (!name.trim() || !reps || reps < 1 || reps > 30 || !work || work <= 0 || (pace.trim() && !p)) {
      setError(x.errWorkout);
      return;
    }
    const def = customWorkout({ name: name.trim(), warmupMin: warmup ?? 0, reps, workBy: by, workValue: by === 'time' ? Math.round(work) : Math.round(work), recoverySec: rec ?? 0, cooldownMin: cool ?? 0, pace: p, tolerance: 8 });
    await db.runWorkouts.add({ name: def.name, runType: def.runType as RunType, blocks: def.blocks, createdAt: Date.now() });
    toast(x.workoutSaved);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={x.newWorkout}>
      <div className="flex flex-col gap-4">
        <TextField label={x.workoutName} value={name} onChange={(v) => { setName(v); setError(undefined); }} placeholder="6 × 800 m" />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={x.warmup} unit="min" value={warmup} onChange={setWarmup} integer />
          <NumberField label={x.reps} value={reps} onChange={setReps} integer />
        </div>
        <Segmented label={x.workBy} value={by} onChange={(v) => { setBy(v); setWork(v === 'time' ? 60 : 800); }} options={[{ value: 'distance', label: x.byDistance }, { value: 'time', label: x.byTime }]} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={by === 'time' ? x.workSec : x.workM} unit={by === 'time' ? 's' : 'm'} value={work} onChange={setWork} integer />
          <NumberField label={x.recovery} unit="s" value={rec} onChange={setRec} integer />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={x.cooldown} unit="min" value={cool} onChange={setCool} integer />
          <TextField label={x.paceInput} value={pace} onChange={setPace} inputMode="numeric" placeholder={x.paceInputHint} hint={t.common.optional} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button size="lg" block onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Sheet>
  );
}
