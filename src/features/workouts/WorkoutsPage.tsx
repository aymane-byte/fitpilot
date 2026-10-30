import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, ChevronRight, Dumbbell, Play, Plus, Sparkles, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { db, updateSettings } from '@/db/db';
import { recommendedPlanKey, SEED_PLANS } from '@/db/seed/programs';
import type { Program } from '@/db/types';
import { useProfile, useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { formatDateFr, todayISO } from '@/lib/dates';
import { formatDuration } from '@/lib/running';
import { epley1RM } from '@/lib/strength';
import { ExerciseForm, ExerciseRow, SearchBar, useExerciseSearch } from './ExercisePicker';
import { activeSession, allRecords, nextPlanProgram, startSession } from './service';

const g = t.gym;
type Tab = 'session' | 'programs' | 'library' | 'records';

export function WorkoutsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'session';
  return (
    <>
      <PageHeader title={g.title} />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={(['session', 'programs', 'library', 'records'] as const).map((v) => ({ value: v, label: g.tabs[v] }))}
        />
        {tab === 'session' && <SessionTab />}
        {tab === 'programs' && <ProgramsTab />}
        {tab === 'library' && <LibraryTab />}
        {tab === 'records' && <RecordsTab />}
      </main>
    </>
  );
}

/** Plan actif : choisi par l'utilisateur, sinon recommandé d'après le profil. */
export function useActivePlanKey() {
  const settings = useSettings();
  const profile = useProfile();
  if (!settings || !profile) return undefined;
  return settings.activePlan ?? recommendedPlanKey(profile.gymDaysPerWeek, profile.runDaysPerWeek, profile.gymLevel);
}

function SessionTab() {
  const navigate = useNavigate();
  const planKey = useActivePlanKey();
  const today = todayISO();
  const active = useLiveQuery(() => activeSession());
  const planned = useLiveQuery(() => db.scheduledActivities.where('date').equals(today).filter((a) => a.kind === 'workout' && a.status === 'planned').first(), [today]);
  const next = useLiveQuery(async () => (planKey ? (await nextPlanProgram(planKey)) ?? null : null), [planKey]);
  const history = useLiveQuery(async () => {
    const sessions = (await db.workoutSessions.orderBy('startedAt').reverse().toArray()).filter((s) => s.endedAt).slice(0, 30);
    return Promise.all(
      sessions.map(async (s) => {
        const sets = await db.workoutSets.where('sessionId').equals(s.id!).toArray();
        return { s, sets: sets.length, volume: sets.reduce((v, x) => v + x.reps * x.weightKg, 0) };
      }),
    );
  });

  async function start(opts: { programId?: number; scheduledId?: number; name: string }) {
    const id = await startSession(opts);
    navigate(`/muscu/seance/${id}`);
  }

  const plan = SEED_PLANS.find((p) => p.key === planKey);

  return (
    <>
      {active && (
        <Link to={`/muscu/seance/${active.id}`} className="flex items-center gap-3 rounded-3xl bg-accent p-4 text-accent-ink animate-rise">
          <Play size={22} fill="currentColor" />
          <span className="flex-1">
            <span className="block font-semibold">{g.resume}</span>
            <span className="block text-sm opacity-80">{active.name}</span>
          </span>
          <ChevronRight size={20} />
        </Link>
      )}
      {!active && (
        <Card>
          <CardTitle icon={<Dumbbell size={18} />}>{g.startFrom}</CardTitle>
          <div className="flex flex-col gap-2">
            {planned && (
              <StartRow
                icon={<CalendarCheck size={20} />}
                label={g.plannedToday}
                title={planned.title}
                onClick={async () => {
                  const program = planned.programId !== undefined ? await db.programs.get(planned.programId) : undefined;
                  start({ programId: program?.id, scheduledId: planned.id, name: planned.title });
                }}
              />
            )}
            {next && (!planned || planned.programId !== next.id) && (
              <StartRow icon={<Sparkles size={20} />} label={`${g.nextInPlan}${plan ? ` · ${plan.name}` : ''}`} title={next.name} onClick={() => start({ programId: next.id, name: next.name })} />
            )}
            <StartRow icon={<Plus size={20} />} label={g.startEmptyHint} title={g.startEmpty} onClick={() => start({ name: g.startEmpty })} />
          </div>
        </Card>
      )}
      <Card>
        <CardTitle>{g.history}</CardTitle>
        {!history?.length ? (
          <p className="text-sm text-muted">{g.noHistory}</p>
        ) : (
          <ul className="-mx-4 -mb-4 divide-y divide-line">
            {history.map(({ s, sets, volume }) => (
              <li key={s.id}>
                <Link to={`/muscu/seance/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="num block text-xs text-muted">
                      {formatDateFr(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatDuration((s.endedAt! - s.startedAt) / 1000)} · {fmt(g.setsCount, { n: sets })} · {num(volume, 0)} kg
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function StartRow({ icon, label, title, onClick }: { icon: ReactNode; label: string; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 text-left active:bg-line">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate font-semibold">{title}</span>
      </span>
      <Play size={18} className="text-accent-text" />
    </button>
  );
}

function ProgramsTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const activeKey = useActivePlanKey();
  const profile = useProfile();
  const programs = useLiveQuery(() => db.programs.toArray()) ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const recommended = profile ? recommendedPlanKey(profile.gymDaysPerWeek, profile.runDaysPerWeek, profile.gymLevel) : undefined;
  const custom = programs.filter((p) => !p.plan);

  async function newProgram() {
    const id = await db.programs.add({ name: t.programEditor.newName, legsHeavy: false, createdAt: Date.now() });
    navigate(`/muscu/programme/${id}`);
  }

  return (
    <>
      {SEED_PLANS.map((plan) => {
        const items = programs.filter((p) => p.plan === plan.key).sort((a, b) => (a.planOrder ?? 0) - (b.planOrder ?? 0));
        const isActive = activeKey === plan.key;
        return (
          <Card key={plan.key} className={isActive ? '!border-accent-text' : ''}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] font-semibold">{plan.name}</h2>
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">{fmt(g.daysPerWeek, { n: plan.daysPerWeek })}</span>
              {recommended === plan.key && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-text">{g.recommended}</span>}
            </div>
            <p className="mb-3 text-sm text-muted">{plan.description}</p>
            {(open === plan.key || isActive) && (
              <ul className="mb-3 divide-y divide-line rounded-2xl border border-line">
                {items.map((p) => (
                  <ProgramLink key={p.id} p={p} />
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              {isActive ? (
                <span className="flex min-h-9 flex-1 items-center justify-center rounded-xl bg-accent-soft text-sm font-semibold text-accent-text">{g.activePlan}</span>
              ) : (
                <>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setOpen(open === plan.key ? null : plan.key)}>
                    {fmt(g.sessionsCount, { n: items.length })}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={async () => {
                      await updateSettings({ activePlan: plan.key });
                      toast(g.planChosen);
                    }}
                  >
                    {g.choosePlan}
                  </Button>
                </>
              )}
            </div>
          </Card>
        );
      })}
      <Card>
        <CardTitle action={<Button size="sm" variant="secondary" onClick={newProgram} icon={<Plus size={16} />}>{g.newProgram}</Button>}>{g.myPrograms}</CardTitle>
        {custom.length === 0 ? (
          <p className="text-sm text-muted">{g.noCustom}</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {custom.map((p) => (
              <ProgramLink key={p.id} p={p} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function ProgramLink({ p }: { p: Program }) {
  const count = useLiveQuery(() => db.programExercises.where('programId').equals(p.id!).count(), [p.id]);
  return (
    <li>
      <Link to={`/muscu/programme/${p.id}`} className="flex min-h-13 items-center gap-2 px-3 py-2 active:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{p.name}</span>
          <span className="block text-xs text-muted">
            {fmt(g.exercisesCount, { n: count ?? 0 })}
            {p.legsHeavy && ` · ${g.legsHeavy}`}
          </span>
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
    </li>
  );
}

function LibraryTab() {
  const navigate = useNavigate();
  const search = useExerciseSearch();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <SearchBar {...search} />
      <Button variant="secondary" block onClick={() => setCreating(true)} icon={<Plus size={18} />}>
        {t.exercise.create}
      </Button>
      {search.filtered.length === 0 ? (
        <Notice>{t.exercise.empty}</Notice>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {search.filtered.map((e) => (
            <ExerciseRow key={e.id} e={e} onClick={() => navigate(`/muscu/exercice/${e.id}`)} />
          ))}
        </ul>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title={t.exercise.newTitle}>
        <ExerciseForm onCreated={(e) => { setCreating(false); navigate(`/muscu/exercice/${e.id}`); }} />
      </Sheet>
    </>
  );
}

function RecordsTab() {
  const rows = useLiveQuery(() => allRecords());
  if (!rows) return null;
  if (!rows.length) return <Notice icon={<Trophy size={16} />}>{g.noRecords}</Notice>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.exercise.id}>
          <Link to={`/muscu/exercice/${r.exercise.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-surface-2">
            <Trophy size={18} className="shrink-0 text-accent-text" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.exercise.name}</span>
              <span className="block text-xs text-muted">{formatDateFr(r.date)}</span>
            </span>
            <span className="text-right">
              <span className="num block font-semibold">
                {num(r.bestWeightKg)} kg × {r.bestWeightReps}
              </span>
              <span className="num block text-xs text-muted">
                {t.exercise.best1RM} {num(r.best1RM || epley1RM(r.bestWeightKg, r.bestWeightReps))} kg
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
