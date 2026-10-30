import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Copy, Play, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { MiniNumber, TextField } from '@/components/Field';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Exercise, ProgramExercise } from '@/db/types';
import { t } from '@/i18n';
import { ExercisePicker } from './ExercisePicker';
import { startSession } from './service';

const p = t.programEditor;

export function ProgramEditorPage() {
  const { id } = useParams();
  const programId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const program = useLiveQuery(async () => (await db.programs.get(programId)) ?? null, [programId]);
  const items = useLiveQuery(() => db.programExercises.where('programId').equals(programId).sortBy('order'), [programId]);
  const exercises = useLiveQuery(async () => {
    if (!items) return undefined;
    return new Map((await db.exercises.bulkGet(items.map((i) => i.exerciseId))).filter(Boolean).map((e) => [e!.id!, e!]));
  }, [items]);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (program === undefined || !items || !exercises) return null;
  if (program === null) {
    return (
      <>
        <PageHeader title={p.title} back />
        <main className="mx-auto max-w-lg px-4"><Notice>{t.live.notFound}</Notice></main>
      </>
    );
  }

  const update = (pe: ProgramExercise, patch: Partial<ProgramExercise>) => db.programExercises.update(pe.id!, patch);
  async function move(i: number, dir: -1 | 1) {
    const a = items![i];
    const b = items![i + dir];
    await db.transaction('rw', db.programExercises, async () => {
      await db.programExercises.update(a.id!, { order: b.order });
      await db.programExercises.update(b.id!, { order: a.order });
    });
  }
  async function add(e: Exercise) {
    setPicking(false);
    const order = items!.reduce((m, x) => Math.max(m, x.order), -1) + 1;
    await db.programExercises.add({ programId, exerciseId: e.id!, order, sets: 3, reps: 10, rpe: 8 });
  }
  async function duplicate() {
    const newId = (await db.transaction('rw', db.programs, db.programExercises, async () => {
      const nid = (await db.programs.add({ name: `${program!.name} ${p.copySuffix}`, legsHeavy: program!.legsHeavy, createdAt: Date.now() })) as number;
      await db.programExercises.bulkAdd(items!.map(({ id: _id, ...rest }) => ({ ...rest, programId: nid })));
      return nid;
    })) as number;
    toast(p.duplicated);
    navigate(`/muscu/programme/${newId}`, { replace: true });
  }
  async function start() {
    const sid = await startSession({ programId, name: program!.name });
    navigate(`/muscu/seance/${sid}`);
  }

  return (
    <>
      <PageHeader title={program.name} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        {program.plan && <Notice>{p.builtinNote}</Notice>}
        <Card className="flex flex-col gap-4">
          <NameField initial={program.name} onSave={(name) => db.programs.update(programId, { name })} />
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2">
            <span>
              <span className="block text-[15px]">{p.legsHeavy}</span>
              <span className="block text-xs text-muted">{p.legsHeavyHint}</span>
            </span>
            <input type="checkbox" checked={program.legsHeavy} onChange={(e) => db.programs.update(programId, { legsHeavy: e.target.checked })} className="size-6 shrink-0 accent-[var(--accent-text)]" />
          </label>
        </Card>

        {items.length === 0 && <Notice>{p.empty}</Notice>}
        {items.map((pe, i) => {
          const ex = exercises.get(pe.exerciseId);
          return (
            <Card key={pe.id} className="!p-3">
              <div className="mb-2 flex items-center gap-1 pl-1">
                <p className="min-w-0 flex-1 truncate font-semibold">{ex?.name}</p>
                <Icon label={t.live.moveUp} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></Icon>
                <Icon label={t.live.moveDown} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></Icon>
                <Icon label={t.live.remove} onClick={() => db.programExercises.delete(pe.id!)}><Trash2 size={16} /></Icon>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([
                  ['sets', p.sets, true],
                  ['reps', p.reps, true],
                  ['weightKg', `${p.weight} (kg)`, false],
                  ['rpe', p.rpe, false],
                ] as const).map(([key, label, integer]) => (
                  <label key={key} className="flex flex-col gap-1 text-center text-[11px] font-medium uppercase text-muted">
                    {label}
                    <MiniNumber
                      label={`${ex?.name} ${label}`}
                      integer={integer}
                      value={pe[key]}
                      placeholder="–"
                      onCommit={(v) => update(pe, { [key]: key === 'sets' || key === 'reps' ? Math.max(1, Math.round(v ?? 1)) : v } as Partial<ProgramExercise>)}
                    />
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
        <Button variant="secondary" size="lg" block onClick={() => setPicking(true)} icon={<Plus size={18} />}>
          {t.live.addExercise}
        </Button>
        <Button size="lg" block onClick={start} disabled={items.length === 0} icon={<Play size={18} />}>
          {p.start}
        </Button>
        {program.plan && (
          <Button variant="secondary" block onClick={duplicate} icon={<Copy size={18} />}>
            {p.duplicate}
          </Button>
        )}
        <Button variant="danger" block onClick={() => setDeleting(true)} icon={<Trash2 size={18} />}>
          {p.delete}
        </Button>
      </main>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={add} />
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={p.delete}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await db.transaction('rw', db.programs, db.programExercises, async () => {
            await db.programExercises.where('programId').equals(programId).delete();
            await db.programs.delete(programId);
          });
          toast(t.gym.deleted);
          navigate('/muscu?tab=programs', { replace: true });
        }}
      >
        {p.deleteConfirm}
      </ConfirmSheet>
    </>
  );
}

function Icon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-10 place-items-center rounded-full text-muted active:bg-surface-2 disabled:opacity-30">
      {children}
    </button>
  );
}

/** Nom édité localement puis enregistré (évite que la base ne réécrive le champ pendant la frappe). */
function NameField({ initial, onSave }: { initial: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <TextField
      label={p.name}
      value={name}
      maxLength={60}
      onChange={(v) => {
        setName(v);
        if (v.trim()) onSave(v.trim());
      }}
    />
  );
}
