import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleAlert, ListChecks, TrendingUp, Trash2, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { LazyTrendChart } from '@/components/LazyTrendChart';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import { num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { exerciseRecords } from '@/lib/strength';

const x = t.exercise;

export function ExerciseDetailPage() {
  const { id } = useParams();
  const exerciseId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const exercise = useLiveQuery(async () => (await db.exercises.get(exerciseId)) ?? null, [exerciseId]);
  const data = useLiveQuery(async () => {
    const sets = (await db.workoutSets.where('exerciseId').equals(exerciseId).toArray()).filter((s) => s.done);
    const sessions = new Map((await db.workoutSessions.bulkGet([...new Set(sets.map((s) => s.sessionId))])).filter((s) => s?.endedAt).map((s) => [s!.id!, s!]));
    const valid = sets.filter((s) => sessions.has(s.sessionId));
    // 1RM estimé max par séance, dans l'ordre chronologique
    const perSession = [...sessions.values()]
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((s) => ({ date: s.date, best: exerciseRecords(valid.filter((v) => v.sessionId === s.id))?.best1RM ?? 0 }))
      .filter((p) => p.best > 0);
    const inUse = sets.length > 0 || (await db.programExercises.where('exerciseId').equals(exerciseId).count()) > 0;
    return { records: exerciseRecords(valid), perSession, inUse };
  }, [exerciseId]);

  if (exercise === undefined || !data) return null;
  if (exercise === null) {
    return (
      <>
        <PageHeader title={t.gym.title} back />
        <main className="mx-auto max-w-lg px-4"><Notice>{x.empty}</Notice></main>
      </>
    );
  }

  return (
    <>
      <PageHeader title={exercise.name} subtitle={`${x.categories[exercise.category]} · ${x.equipment[exercise.equipment]}`} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        {exercise.muscles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {exercise.muscles.map((m) => (
              <span key={m} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                {x.muscles[m] ?? m}
              </span>
            ))}
          </div>
        )}
        {exercise.instructions && (
          <Card>
            <CardTitle icon={<ListChecks size={18} />}>{x.instructions}</CardTitle>
            <p className="text-[15px] leading-relaxed">{exercise.instructions}</p>
          </Card>
        )}
        {exercise.mistakes && (
          <Card>
            <CardTitle icon={<CircleAlert size={18} />}>{x.mistakes}</CardTitle>
            <p className="text-[15px] leading-relaxed">{exercise.mistakes}</p>
          </Card>
        )}
        <Card>
          <CardTitle icon={<Trophy size={18} />}>{x.records}</CardTitle>
          {data.records ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">{x.bestWeight}</p>
                  <p className="num text-xl font-semibold">{num(data.records.bestWeightKg)} kg × {data.records.bestWeightReps}</p>
                </div>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">{x.best1RM}</p>
                  <p className="num text-xl font-semibold">{num(data.records.best1RM)} kg</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">{x.oneRmHint}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{x.noHistory}</p>
          )}
        </Card>
        {data.perSession.length >= 2 && (
          <Card>
            <CardTitle icon={<TrendingUp size={18} />}>{x.progression}</CardTitle>
            <LazyTrendChart
              labels={data.perSession.map((p) => formatDateFr(p.date))}
              values={data.perSession.map((p) => p.best)}
              format={(v) => `${num(v)} kg`}
              ariaLabel={x.progression}
            />
          </Card>
        )}
        {exercise.custom && (
          <>
            {data.inUse ? (
              <Notice>{x.inUse}</Notice>
            ) : (
              <Button variant="danger" block onClick={() => setDeleting(true)} icon={<Trash2 size={18} />}>
                {x.deleteCustom}
              </Button>
            )}
          </>
        )}
      </main>
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={x.deleteCustom}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await db.exercises.delete(exerciseId);
          toast(t.gym.deleted);
          navigate(-1);
        }}
      />
    </>
  );
}
