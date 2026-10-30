import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BedDouble, CalendarPlus, Check, ChevronLeft, ChevronRight, Dumbbell, Footprints, Plus, Sparkles, TriangleAlert, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Sheet } from '@/components/Sheet';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { db, updateSettings } from '@/db/db';
import { shareOrDownload } from '@/db/backup';
import type { ScheduledActivity } from '@/db/types';
import { useProfile, useSettings } from '@/hooks/useData';
import { fmt, t } from '@/i18n';
import { addDays, formatDateFr, startOfWeek, todayISO } from '@/lib/dates';
import { conflictsIfAdded, findConflicts, type Conflict } from '@/lib/planning';
import { startSession } from '../workouts/service';
import { generateAndSave, recoveryDaysOf, TIME_BY_PREF, weekActivities, weekIcs } from './service';

const pl = t.planning;
const KIND_ICON = { workout: Dumbbell, run: Footprints, rest: BedDouble } as const;

export function conflictText(c: Conflict) {
  const run = formatDateFr(c.runDate, { weekday: 'long', day: 'numeric' });
  const legs = formatDateFr(c.legsDate, { weekday: 'long', day: 'numeric' });
  return fmt(c.type === 'run_after_legs' ? pl.conflictAfter : pl.conflictSame, { run, legs });
}

export function PlanningPage() {
  const profile = useProfile();
  const settings = useSettings();
  const toast = useToast();
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const activities = useLiveQuery(() => weekActivities(weekStart), [weekStart]);
  const [editing, setEditing] = useState<Partial<ScheduledActivity> | null>(null);
  const [generating, setGenerating] = useState(false);
  if (!profile || !activities || !settings) return null;

  const recovery = recoveryDaysOf(settings.recoveryHoursLegsBeforeRun);
  const conflicts = findConflicts(activities, recovery);
  const count = (kind: 'workout' | 'run') => ({
    done: activities.filter((a) => a.kind === kind && a.status === 'done').length,
    planned: activities.filter((a) => a.kind === kind && a.status !== 'skipped').length,
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  async function exportIcs() {
    const ics = weekIcs(activities!);
    if (!ics) {
      toast(pl.nothingToExport, 'error');
      return;
    }
    const res = await shareOrDownload(ics, `fitpilot-semaine-${weekStart}.ics`, 'text/calendar');
    if (res !== 'cancelled') toast(pl.exported);
  }

  return (
    <>
      <PageHeader title={pl.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
          <button type="button" aria-label={pl.prevWeek} onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid size-11 place-items-center rounded-xl active:bg-surface-2">
            <ChevronLeft size={20} />
          </button>
          <p className="font-semibold">{fmt(pl.weekOf, { date: formatDateFr(weekStart, { day: 'numeric', month: 'long' }) })}</p>
          <button type="button" aria-label={pl.nextWeek} onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid size-11 place-items-center rounded-xl active:bg-surface-2">
            <ChevronRight size={20} />
          </button>
        </div>

        {conflicts.map((c) => (
          <Notice key={`${c.runDate}-${c.legsDate}`} tone="warning" icon={<TriangleAlert size={16} />}>
            {conflictText(c)}
          </Notice>
        ))}

        <Card>
          <CardTitle>{pl.objectives}</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            {(['workout', 'run'] as const).map((k) => {
              const c = count(k);
              const Icon = KIND_ICON[k];
              return (
                <div key={k} className="rounded-2xl bg-surface-2 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon size={14} /> {k === 'workout' ? pl.objWorkouts : pl.objRuns}
                  </p>
                  <p className="num text-xl font-semibold">
                    {c.done}
                    <span className="text-sm font-normal text-muted"> / {c.planned}</span>
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {fmt(pl.prefsText, { gym: profile.gymDaysPerWeek, run: profile.runDaysPerWeek, time: t.options.time[profile.preferredTime].toLowerCase() })}
            <Link to="/profil" className="font-semibold text-accent-text">
              {pl.editProfile}
            </Link>
          </p>
          <div className="mt-3">
            <Segmented
              label={pl.recovery}
              value={recovery}
              onChange={(d) => updateSettings({ recoveryHoursLegsBeforeRun: d * 24 })}
              options={[
                { value: 1, label: pl.recovery24 },
                { value: 2, label: pl.recovery48 },
              ]}
            />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setGenerating(true)} icon={<Sparkles size={18} />}>
            {pl.generate}
          </Button>
          <Button variant="secondary" onClick={exportIcs} icon={<CalendarPlus size={18} />}>
            {pl.exportIcs}
          </Button>
        </div>
        <p className="-mt-2 text-xs text-muted">{pl.exportHint}</p>

        {activities.length === 0 && <Notice>{pl.emptyWeek}</Notice>}

        <ol className="flex flex-col gap-2">
          {days.map((d) => {
            const list = activities.filter((a) => a.date === d);
            return (
              <li key={d} className={`rounded-3xl border bg-surface p-3 ${d === today ? 'border-accent-text' : 'border-line'}`}>
                <div className="mb-1 flex items-center justify-between pl-1">
                  <p className="text-sm font-semibold first-letter:uppercase">
                    {formatDateFr(d, { weekday: 'long', day: 'numeric', month: 'short' })}
                    {d === today && <span className="ml-2 text-xs font-medium text-accent-text">{t.common.today}</span>}
                  </p>
                  <button
                    type="button"
                    aria-label={`${pl.add} ${formatDateFr(d)}`}
                    onClick={() => setEditing({ date: d, kind: 'workout', title: '', status: 'planned', time: TIME_BY_PREF[profile.preferredTime] })}
                    className="grid size-10 place-items-center rounded-full text-muted active:bg-surface-2"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {list.map((a) => {
                    const Icon = KIND_ICON[a.kind];
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-line ${a.kind === 'rest' ? 'bg-transparent' : 'bg-surface-2'} ${a.status === 'skipped' ? 'opacity-50' : ''}`}
                        >
                          <Icon size={18} className={a.kind === 'rest' ? 'text-muted' : 'text-accent-text'} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[15px] ${a.kind === 'rest' ? 'text-muted' : 'font-medium'} ${a.status === 'skipped' ? 'line-through' : ''}`}>{a.title}</span>
                            {(a.time || a.legsHeavy) && (
                              <span className="block text-xs text-muted">
                                {a.time}
                                {a.legsHeavy && ` · ${pl.legsTag}`}
                              </span>
                            )}
                          </span>
                          {a.status === 'done' && (
                            <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-ink" aria-label={pl.status.done}>
                              <Check size={14} strokeWidth={3} />
                            </span>
                          )}
                          {a.status === 'skipped' && <X size={16} className="text-muted" aria-label={pl.status.skipped} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </main>
      {editing && <ActivitySheet initial={editing} weekActivities={activities} recovery={recovery} onClose={() => setEditing(null)} />}
      <ConfirmSheet
        open={generating}
        onClose={() => setGenerating(false)}
        title={pl.regenerateTitle}
        confirmLabel={pl.generate}
        onConfirm={async () => {
          await generateAndSave(weekStart, profile);
          toast(pl.generated);
        }}
      >
        {fmt(pl.regenerateText, { gym: profile.gymDaysPerWeek, run: profile.runDaysPerWeek })}
      </ConfirmSheet>
    </>
  );
}

function ActivitySheet({ initial, weekActivities, recovery, onClose }: { initial: Partial<ScheduledActivity>; weekActivities: ScheduledActivity[]; recovery: number; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const programs = useLiveQuery(() => db.programs.toArray()) ?? [];
  const [a, setA] = useState<Partial<ScheduledActivity>>(initial);
  const [pendingConflicts, setPendingConflicts] = useState<Conflict[] | null>(null);
  const isNew = initial.id === undefined;
  const weekStart = startOfWeek(initial.date!);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const set = (patch: Partial<ScheduledActivity>) => setA((x) => ({ ...x, ...patch }));

  const defaultTitle = a.kind === 'rest' ? t.planning.kind.rest : a.kind === 'run' ? t.run.types[a.runType ?? 'easy'] : programs.find((p) => p.id === a.programId)?.name ?? t.planning.kind.workout;

  async function save(force = false) {
    const row = { ...a, title: a.title?.trim() || defaultTitle, status: a.status ?? 'planned' } as ScheduledActivity;
    if (row.kind !== 'workout') {
      row.programId = undefined;
      row.legsHeavy = false;
    }
    if (!force) {
      const others = weekActivities.filter((x) => x.id !== row.id);
      const c = conflictsIfAdded(others, row, recovery);
      if (c.length) {
        setPendingConflicts(c);
        return;
      }
    }
    if (isNew) await db.scheduledActivities.add(row);
    else await db.scheduledActivities.put(row);
    toast(t.planning.saved);
    onClose();
  }

  async function startNow() {
    const program = a.programId !== undefined ? programs.find((p) => p.id === a.programId) : undefined;
    const id = await startSession({ programId: program?.id, scheduledId: a.id, name: a.title || defaultTitle });
    navigate(`/muscu/seance/${id}`);
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? pl.addTitle : pl.editTitle}>
      <div className="flex flex-col gap-4">
        <Segmented
          value={a.kind ?? 'workout'}
          onChange={(kind) => set({ kind, title: '' })}
          options={(['workout', 'run', 'rest'] as const).map((k) => ({ value: k, label: pl.kind[k] }))}
        />
        {a.kind === 'workout' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">{pl.program}</span>
            <select
              value={a.programId ?? ''}
              onChange={(e) => {
                const p = programs.find((x) => x.id === Number(e.target.value));
                set({ programId: p?.id, legsHeavy: p?.legsHeavy ?? false, title: p?.name ?? '' });
              }}
              className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-fg"
            >
              <option value="">{pl.noProgram}</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {a.kind === 'run' && (
          <Segmented layout="grid" value={a.runType ?? 'easy'} onChange={(runType) => set({ runType, title: '' })} options={(['easy', 'tempo', 'intervals', 'long', 'recovery'] as const).map((k) => ({ value: k, label: t.run.types[k] }))} />
        )}
        <TextField label={pl.titleLabel} value={a.title ?? ''} placeholder={defaultTitle} onChange={(title) => set({ title })} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{pl.day}</span>
          <select value={a.date} onChange={(e) => set({ date: e.target.value })} className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-fg first-letter:uppercase">
            {days.map((d) => (
              <option key={d} value={d}>
                {formatDateFr(d, { weekday: 'long', day: 'numeric', month: 'short' })}
              </option>
            ))}
          </select>
        </label>
        {a.kind !== 'rest' && <TextField label={pl.time} type="time" value={a.time ?? ''} onChange={(time) => set({ time: time || undefined })} />}
        {a.kind === 'workout' && (
          <label className="flex min-h-12 items-center justify-between rounded-2xl bg-surface-2 px-4">
            <span className="text-[15px]">{pl.legsHeavy}</span>
            <input type="checkbox" checked={!!a.legsHeavy} onChange={(e) => set({ legsHeavy: e.target.checked })} className="size-6 accent-[var(--accent-text)]" />
          </label>
        )}
        {a.notes && <p className="rounded-2xl bg-surface-2 p-3 text-sm text-muted">{a.notes}</p>}
        {!isNew && a.kind !== 'rest' && (
          <Segmented
            value={a.status ?? 'planned'}
            onChange={(status) => set({ status })}
            options={[
              { value: 'planned', label: pl.markPlanned },
              { value: 'done', label: pl.markDone },
              { value: 'skipped', label: pl.markSkipped },
            ]}
          />
        )}
        {pendingConflicts && (
          <div className="flex flex-col gap-2">
            {pendingConflicts.map((c) => (
              <Notice key={c.runDate + c.legsDate} tone="warning" icon={<TriangleAlert size={16} />}>
                {conflictText(c)}
              </Notice>
            ))}
            <Button variant="secondary" block onClick={() => save(true)}>
              {pl.conflictConfirm}
            </Button>
          </div>
        )}
        {!pendingConflicts && (
          <Button size="lg" block onClick={() => save()}>
            {t.common.save}
          </Button>
        )}
        {!isNew && a.kind === 'workout' && a.status === 'planned' && a.date === todayISO() && (
          <Button size="lg" variant="secondary" block onClick={startNow} icon={<Dumbbell size={18} />}>
            {pl.start}
          </Button>
        )}
        {!isNew && a.kind !== 'rest' && (
          <Button
            variant="secondary"
            block
            icon={<CalendarPlus size={18} />}
            onClick={async () => {
              const ics = weekIcs([{ ...(a as ScheduledActivity), status: 'planned' }]);
              if (ics) await shareOrDownload(ics, `fitpilot-${a.date}.ics`, 'text/calendar');
            }}
          >
            {t.reminders.addToCalendar}
          </Button>
        )}
        {!isNew && (
          <Button
            variant="danger"
            block
            onClick={async () => {
              await db.scheduledActivities.delete(initial.id!);
              onClose();
            }}
          >
            {t.common.delete}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
