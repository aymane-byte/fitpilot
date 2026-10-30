import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Check, Lightbulb, Minus, Plus, Timer, Trash2, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { MiniNumber } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Exercise, WorkoutSet } from '@/db/types';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { formatDuration } from '@/lib/running';
import { volume } from '@/lib/strength';
import { ExercisePicker } from './ExercisePicker';
import { deleteSession, finishSession, sessionPrs, suggestionFor } from './service';
import { unlockAudio, useRestTimer } from './useRestTimer';

const l = t.live;

interface Group {
  exercise: Exercise;
  sets: WorkoutSet[];
}

export function LiveWorkoutPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const timer = useRestTimer();
  const session = useLiveQuery(async () => (await db.workoutSessions.get(sessionId)) ?? null, [sessionId]);
  const sets = useLiveQuery(() => db.workoutSets.where('sessionId').equals(sessionId).sortBy('order'), [sessionId]);
  const exercises = useLiveQuery(async () => {
    if (!sets) return undefined;
    const ids = [...new Set(sets.map((s) => s.exerciseId))];
    return new Map((await db.exercises.bulkGet(ids)).filter(Boolean).map((e) => [e!.id!, e!]));
  }, [sets]);
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [summary, setSummary] = useState<{ volume: number; duration: number; prs: { name: string; value: number }[] }>();

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const groups = useMemo<Group[]>(() => {
    if (!sets || !exercises) return [];
    const out: Group[] = [];
    for (const s of sets) {
      const ex = exercises.get(s.exerciseId);
      if (!ex) continue;
      const g = out.find((x) => x.exercise.id === s.exerciseId);
      if (g) g.sets.push(s);
      else out.push({ exercise: ex, sets: [s] });
    }
    return out;
  }, [sets, exercises]);

  if (session === undefined || !sets) return null;
  if (session === null) {
    return (
      <>
        <PageHeader title={t.gym.title} back />
        <main className="mx-auto max-w-lg px-4">
          <Notice>{l.notFound}</Notice>
        </main>
      </>
    );
  }

  const ended = session.endedAt !== undefined;
  const elapsed = Math.floor(((session.endedAt ?? now) - session.startedAt) / 1000);
  const doneCount = sets.filter((s) => s.done).length;

  async function reorder(from: number, to: number) {
    const next = [...groups];
    const [g] = next.splice(from, 1);
    next.splice(to, 0, g);
    let order = 0;
    await db.transaction('rw', db.workoutSets, async () => {
      for (const grp of next) for (const s of grp.sets) await db.workoutSets.update(s.id!, { order: order++ });
    });
  }

  async function addExercise(e: Exercise) {
    setPicking(false);
    const maxOrder = sets!.reduce((m, s) => Math.max(m, s.order), -1);
    const { last } = await suggestionFor(e, { reps: 10 }, sessionId);
    const weight = last.length ? Math.max(...last.map((s) => s.weightKg)) : 0;
    const reps = last.length ? last[0].reps : 10;
    await db.workoutSets.bulkAdd(
      [0, 1, 2].map((i) => ({ sessionId, exerciseId: e.id!, order: maxOrder + 1 + i, reps, weightKg: weight, done: false, targetReps: reps })),
    );
  }

  async function finish() {
    const prs = await sessionPrs(sessionId);
    const doneSets = sets!.filter((s) => s.done);
    await finishSession(sessionId);
    timer.stop();
    setSummary({
      volume: volume(doneSets),
      duration: elapsed,
      prs: prs.map((p) => ({ name: exercises?.get(p.exerciseId)?.name ?? '', value: p.value })),
    });
  }

  return (
    <>
      <PageHeader
        title={session.name}
        subtitle={
          <span className="num flex items-center gap-1.5 normal-case">
            <Timer size={14} /> {l.elapsed} {formatDuration(elapsed)}
          </span>
        }
        back
        action={
          !ended && (
            <Button size="sm" onClick={() => setFinishing(true)}>
              {l.finish}
            </Button>
          )
        }
      />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-48">
        {groups.length === 0 && <Notice>{l.noExercise}</Notice>}
        {groups.map((g, i) => (
          <ExerciseBlock
            key={g.exercise.id}
            group={g}
            sessionId={sessionId}
            readOnly={ended}
            canUp={i > 0}
            canDown={i < groups.length - 1}
            onUp={() => reorder(i, i - 1)}
            onDown={() => reorder(i, i + 1)}
            onSetDone={() => timer.start(settings?.restTimerSec ?? 90)}
          />
        ))}
        {!ended && (
          <>
            <Button variant="secondary" block size="lg" onClick={() => { unlockAudio(); setPicking(true); }} icon={<Plus size={18} />}>
              {l.addExercise}
            </Button>
            <p className="px-1 text-xs text-muted">{l.rpeHint}</p>
            <p className="px-1 text-xs text-muted">{l.soundNote}</p>
            <Button variant="ghost" block onClick={() => setDiscarding(true)}>
              {l.discard}
            </Button>
          </>
        )}
        {ended && (
          <Button variant="danger" block onClick={() => setDiscarding(true)} icon={<Trash2 size={18} />}>
            {t.gym.deleteSession}
          </Button>
        )}
      </main>

      {(timer.active || timer.justFinished) && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 px-4 pb-3 animate-rise">
          <div className={`mx-auto flex max-w-lg items-center gap-2 rounded-2xl border p-2 pl-4 shadow-xl ${timer.justFinished ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`} role="timer" aria-live="polite">
            <Timer size={20} />
            <span className="flex-1 font-semibold">
              {timer.justFinished ? l.restDone : <span className="num text-xl">{l.rest} {formatDuration(timer.remaining)}</span>}
            </span>
            {timer.active && (
              <>
                <Button size="sm" variant="secondary" onClick={() => timer.add(-15)} aria-label="−15 s">
                  −15
                </Button>
                <Button size="sm" variant="secondary" onClick={() => timer.add(15)} aria-label="+15 s">
                  +15
                </Button>
                <Button size="sm" variant="secondary" onClick={timer.stop}>
                  {l.restSkip}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={addExercise} />
      <ConfirmSheet open={finishing} onClose={() => setFinishing(false)} title={l.finishTitle} confirmLabel={l.finish} onConfirm={finish}>
        {fmt(l.finishText, { done: doneCount, total: sets.length })}
      </ConfirmSheet>
      <ConfirmSheet
        open={discarding}
        onClose={() => setDiscarding(false)}
        title={ended ? t.gym.deleteSession : l.discard}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await deleteSession(sessionId);
          timer.stop();
          toast(t.gym.deleted);
          navigate('/muscu', { replace: true });
        }}
      >
        {ended ? t.gym.deleteSessionConfirm : l.discardConfirm}
      </ConfirmSheet>
      <Sheet open={!!summary} onClose={() => navigate('/muscu', { replace: true })} title={l.finished}>
        {summary && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xs text-muted">{t.gym.duration}</p>
                <p className="num text-xl font-semibold">{formatDuration(summary.duration)}</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xs text-muted">{t.gym.volume}</p>
                <p className="num text-xl font-semibold">{num(summary.volume, 0)} kg</p>
              </div>
            </div>
            {summary.prs.length > 0 && (
              <div className="rounded-2xl bg-accent-soft p-3">
                <p className="mb-1 flex items-center gap-2 font-semibold text-accent-text">
                  <Trophy size={18} /> {l.prs}
                </p>
                <ul className="text-sm">
                  {summary.prs.map((p) => (
                    <li key={p.name}>
                      {p.name} : <span className="num font-semibold">{num(p.value)} kg</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button size="lg" block onClick={() => navigate('/muscu', { replace: true })}>
              {t.common.close}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function ExerciseBlock({
  group,
  sessionId,
  readOnly,
  canUp,
  canDown,
  onUp,
  onDown,
  onSetDone,
}: {
  group: Group;
  sessionId: number;
  readOnly: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onSetDone: () => void;
}) {
  const { exercise, sets } = group;
  const target = { reps: sets[0]?.targetReps ?? sets[0]?.reps ?? 10, rpe: sets[0]?.targetRpe };
  const hint = useLiveQuery(() => suggestionFor(exercise, target, sessionId), [exercise.id, sessionId, target.reps, target.rpe]);

  const update = (s: WorkoutSet, patch: Partial<WorkoutSet>) => db.workoutSets.update(s.id!, patch);
  async function addSet() {
    const last = sets.at(-1)!;
    // Décale les exercices suivants pour garder l'ordre.
    await db.transaction('rw', db.workoutSets, async () => {
      await db.workoutSets.where('sessionId').equals(sessionId).filter((s) => s.order > last.order).modify((s) => { s.order += 1; });
      await db.workoutSets.add({ sessionId, exerciseId: exercise.id!, order: last.order + 1, reps: last.reps, weightKg: last.weightKg, rpe: undefined, done: false, targetReps: last.targetReps, targetRpe: last.targetRpe });
    });
  }
  const removeExercise = () => db.workoutSets.bulkDelete(sets.map((s) => s.id!));

  const sug = hint?.suggestion;
  const sugText =
    !sug ? null : sug.kind === 'first' ? l.suggestion.first : fmt(l.suggestion[sug.kind], { w: num(sug.weightKg), r: sug.reps });
  const lastText = hint?.last.length ? fmt(l.last, { sets: hint.last.map((s) => `${num(s.weightKg)}×${s.reps}`).join(', ') }) : null;

  return (
    <Card className="!p-3">
      <div className="mb-2 flex items-start gap-2 px-1">
        <div className="min-w-0 flex-1">
          <Link to={`/muscu/exercice/${exercise.id}`} className="block text-[16px] font-semibold leading-tight">
            {exercise.name}
          </Link>
          {lastText && <p className="num mt-0.5 text-xs text-muted">{lastText}</p>}
        </div>
        {!readOnly && (
          <div className="flex shrink-0">
            <IconBtn label={l.moveUp} disabled={!canUp} onClick={onUp}><ArrowUp size={16} /></IconBtn>
            <IconBtn label={l.moveDown} disabled={!canDown} onClick={onDown}><ArrowDown size={16} /></IconBtn>
            <IconBtn label={l.remove} onClick={removeExercise}><Trash2 size={16} /></IconBtn>
          </div>
        )}
      </div>
      {sugText && !readOnly && (
        <p className="mb-2 flex items-start gap-1.5 rounded-xl bg-accent-soft px-2.5 py-2 text-xs font-medium text-accent-text">
          <Lightbulb size={14} className="mt-px shrink-0" /> {sugText}
        </p>
      )}
      <div className="grid grid-cols-[1.75rem_1fr_1fr_3.25rem_2.75rem] items-center gap-1.5 px-1 pb-1 text-[11px] font-medium uppercase text-muted">
        <span>#</span>
        <span className="text-center">{l.kg}</span>
        <span className="text-center">{l.reps}</span>
        <span className="text-center">{l.rpe}</span>
        <span />
      </div>
      <ul className="flex flex-col gap-1.5">
        {sets.map((s, i) => (
          <li key={s.id} className={`grid grid-cols-[1.75rem_1fr_1fr_3.25rem_2.75rem] items-center gap-1.5 rounded-xl px-1 py-0.5 ${s.done ? 'bg-accent-soft' : ''}`}>
            <span className="num text-center text-sm text-muted">{i + 1}</span>
            <MiniNumber label={`${l.set} ${i + 1} ${l.kg}`} value={s.weightKg} onCommit={(v) => update(s, { weightKg: v ?? 0 })} />
            <MiniNumber label={`${l.set} ${i + 1} ${l.reps}`} value={s.reps} integer onCommit={(v) => update(s, { reps: Math.round(v ?? 0) })} />
            <MiniNumber label={`${l.set} ${i + 1} ${l.rpe}`} value={s.rpe} placeholder="–" onCommit={(v) => update(s, { rpe: v === undefined ? undefined : Math.min(10, v) })} />
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={s.done}
              aria-label={s.done ? l.unvalidate : l.validate}
              onClick={async () => {
                await update(s, { done: !s.done });
                if (!s.done) onSetDone();
              }}
              className={`grid size-11 place-items-center rounded-xl transition ${s.done ? 'bg-accent text-accent-ink' : 'border border-line bg-surface-2 text-muted'}`}
            >
              <Check size={20} strokeWidth={3} />
            </button>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={addSet} icon={<Plus size={16} />}>
            {l.addSet}
          </Button>
          {sets.length > 1 && (
            <Button size="sm" variant="secondary" onClick={() => db.workoutSets.delete(sets.at(-1)!.id!)} aria-label={`${l.remove} ${l.set}`}>
              <Minus size={16} />
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-10 place-items-center rounded-full text-muted active:bg-surface-2 disabled:opacity-30">
      {children}
    </button>
  );
}
