import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarCheck,
  Check,
  ChevronRight,
  Circle,
  Dumbbell,
  Flame,
  Footprints,
  Plus,
  Scale,
  Smartphone,
  Sparkles,
  Trophy,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { db } from '@/db/db';
import { needsBackupReminder } from '@/db/backup';
import type { BodyMeasurement, Profile, ScheduledActivity } from '@/db/types';
import { useProfile, useSettings, useTargets, useWeightEntries } from '@/hooks/useData';
import { fmt, num, signed, t } from '@/i18n';
import { addDays, formatDateFr, startOfWeek, todayISO } from '@/lib/dates';
import type { Targets } from '@/lib/energy';
import { activityStreak, weeklyTrend } from '@/lib/stats';
import { formatDuration, runRecords } from '@/lib/running';
import { isStandalone } from '../install/platform';
import { allRecords, startSession } from '../workouts/service';
import { DaySummary } from '../nutrition/NutritionPage';
import { WaterTracker } from '../nutrition/WaterTracker';
import { dayItems } from '../nutrition/service';
import { nextAction, todayItems, type TodayKey } from './today';
import { WeightSheet } from './WeightSheet';

// Chart.js est chargé à part pour accélérer le premier affichage.
const WeightChart = lazy(() => import('./WeightChart').then((m) => ({ default: m.WeightChart })));

const d = t.dashboard;

export function DashboardPage() {
  const profile = useProfile();
  const entries = useWeightEntries();
  const settings = useSettings();
  const data = useTargets(profile, entries);
  const today = todayISO();
  const water = useLiveQuery(() => db.waterLogs.where('date').equals(today).toArray(), [today]);
  // Activité du jour : la première séance/course non sautée (la prévue en priorité).
  const mealCount = useLiveQuery(async () => Object.values(await dayItems(today)).flat().length, [today]);
  const planned = useLiveQuery(async () => {
    const list = (await db.scheduledActivities.where('date').equals(today).toArray()).filter((a) => a.kind !== 'rest' && a.status !== 'skipped');
    return list.find((a) => a.status === 'planned') ?? list[0] ?? null;
  }, [today]);
  const [weightOpen, setWeightOpen] = useState(false);

  if (!profile || !entries || !data || !settings || !water || planned === undefined || mealCount === undefined) return null;

  const waterMl = water.reduce((s, w) => s + w.ml, 0);
  const backupDue = needsBackupReminder(settings.lastBackupAt);

  return (
    <>
      <header className="pt-safe">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 pt-4 pb-2">
          <div>
            <p className="text-sm text-muted first-letter:uppercase">{formatDateFr(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="text-[28px] font-bold tracking-tight">{fmt(d.hello, { name: profile.name })}</h1>
          </div>
          <Link to="/profil" aria-label={t.more.profile} className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted active:bg-line">
            <UserRound size={20} />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        {backupDue && <BackupBanner />}
        <InstallBanner />
        <TodayCard
          weighedToday={entries.some((e) => e.date === today)}
          waterMl={waterMl}
          targets={data.targets}
          backupDue={backupDue}
          planned={planned}
          mealsLogged={mealCount > 0}
          onWeigh={() => setWeightOpen(true)}
        />
        <WeightCard profile={profile} entries={entries} current={data.weight} onAdd={() => setWeightOpen(true)} />
        <NutritionCard targets={data.targets} />
        <WeekCard />
      </main>
      {weightOpen && <WeightSheet open onClose={() => setWeightOpen(false)} entries={entries} lastWeight={data.weight} />}
    </>
  );
}

function BackupBanner() {
  return (
    <Notice tone="warning" icon={<TriangleAlert size={16} />}>
      <p>{d.backupWarn}</p>
      <Link to="/parametres" className="mt-1.5 inline-block font-semibold underline underline-offset-2">
        {d.backupCta}
      </Link>
    </Notice>
  );
}

const INSTALL_DISMISS_KEY = 'fitpilot-install-dismissed';

function InstallBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return isStandalone() || localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
    } catch {
      return isStandalone();
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      /* rien */
    }
    setHidden(true);
  };
  return (
    <Card className="flex items-center gap-3 !p-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <Smartphone size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{d.installTitle}</p>
        <Link to="/installer" className="text-sm font-medium text-accent-text">
          {d.installCta}
        </Link>
      </div>
      <button type="button" onClick={dismiss} aria-label={d.dismiss} className="grid size-10 place-items-center rounded-full text-muted active:bg-surface-2">
        <X size={18} />
      </button>
    </Card>
  );
}

function TodayCard({ weighedToday, waterMl, targets, backupDue, planned, mealsLogged, onWeigh }: { weighedToday: boolean; waterMl: number; targets: Targets; backupDue: boolean; planned: ScheduledActivity | null; mealsLogged: boolean; onWeigh: () => void }) {
  const navigate = useNavigate();
  const items = todayItems({ weighedToday, waterMl, waterTargetMl: targets.waterMl, backupDue, hour: new Date().getHours(), planned: planned ? { done: planned.status === 'done' } : undefined, mealsLogged });
  const next = nextAction(items);
  const label: Record<TodayKey, string> = {
    weigh: d.itemWeigh,
    water: fmt(d.itemWater, { done: num(waterMl, 0), target: num(targets.waterMl, 0) }),
    backup: d.itemBackup,
    meals: d.itemMeals,
    activity: planned ? fmt(planned.kind === 'run' ? d.itemRun : d.itemWorkout, { title: planned.title }) : '',
  };
  async function startPlanned() {
    if (!planned) return;
    const id = await startSession({ programId: planned.programId, scheduledId: planned.id, name: planned.title });
    navigate(`/muscu/seance/${id}`);
  }
  const done = items.filter((i) => i.done).length;

  return (
    <Card>
      <CardTitle icon={<CalendarCheck size={18} />} action={<span className="num text-sm text-muted">{done}/{items.length}</span>}>
        {d.todayTitle}
      </CardTitle>
      <ul className="mb-3 flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.key} className="flex min-h-9 items-center gap-2.5 text-[15px]">
            {i.done ? (
              <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-ink">
                <Check size={14} strokeWidth={3} />
              </span>
            ) : (
              <Circle size={24} className="text-line" />
            )}
            <span className={i.done ? 'text-muted line-through' : ''}>{label[i.key]}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl bg-surface-2 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          <Sparkles size={14} className="text-accent-text" />
          {d.nextUp}
        </p>
        {next ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="font-semibold">{label[next.key]}</p>
            {next.key === 'weigh' && (
              <Button size="sm" onClick={onWeigh} icon={<Scale size={16} />}>
                {t.common.add}
              </Button>
            )}
            {next.key === 'activity' && planned?.kind === 'workout' && (
              <Button size="sm" onClick={startPlanned} icon={<Dumbbell size={16} />}>
                {t.planning.start}
              </Button>
            )}
            {next.key === 'activity' && planned?.kind === 'run' && (
              <Link to="/course/gps" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-accent-ink">
                <Footprints size={16} /> {t.run.gps}
              </Link>
            )}
            {next.key === 'meals' && (
              <Link to="/nutrition" className="inline-flex min-h-9 shrink-0 items-center rounded-xl bg-accent px-3 text-sm font-semibold text-accent-ink">
                {t.common.add}
              </Link>
            )}
            {next.key === 'backup' && (
              <Link to="/parametres" className="inline-flex min-h-9 items-center rounded-xl bg-accent px-3 text-sm font-semibold text-accent-ink">
                {d.backupCta}
              </Link>
            )}
          </div>
        ) : (
          <p className="mt-2 font-medium">{d.allDone}</p>
        )}
      </div>
    </Card>
  );
}

type Range = '30' | '90' | 'all';

function WeightCard({ profile, entries, current, onAdd }: { profile: Profile; entries: BodyMeasurement[]; current: number; onAdd: () => void }) {
  const [range, setRange] = useState<Range>('30');
  const today = todayISO();
  const series = useMemo(() => entries.map((e) => ({ date: e.date, value: e.weightKg! })), [entries]);
  const visible = useMemo(() => (range === 'all' ? series : series.filter((p) => p.date > addDays(today, -Number(range)))), [series, range, today]);
  const trend = weeklyTrend(series, today);
  const target = profile.targetWeightKg;
  const daysWithData = new Set(series.filter((p) => p.date > addDays(today, -14)).map((p) => p.date)).size;

  // Couleur de la tendance : verte si elle va dans le sens de l'objectif.
  const wantsDown = target !== undefined ? target < current : profile.goal === 'fat_loss' || profile.goal === 'recomp';
  const trendGood = trend?.changeKg != null && (wantsDown ? trend.changeKg <= 0 : trend.changeKg >= 0);

  return (
    <Card>
      <CardTitle
        icon={<Scale size={18} />}
        action={
          <Button size="sm" variant="secondary" onClick={onAdd} icon={<Plus size={16} />}>
            {d.addWeight}
          </Button>
        }
      >
        {d.weightTitle}
      </CardTitle>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label={d.current} value={`${num(current)}`} unit="kg" />
        <Stat label={d.target} value={target !== undefined ? num(target) : '—'} unit={target !== undefined ? 'kg' : ''} />
        <Stat label={d.toGo} value={target !== undefined ? signed(target - current) : '—'} unit={target !== undefined ? 'kg' : ''} />
      </div>
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm">
        <span className="text-muted">{d.trend7}</span>
        {trend?.changeKg != null ? (
          <span className={`num font-semibold ${trendGood ? 'text-accent-text' : 'text-warning'}`}>{fmt(d.trendPerWeek, { kg: signed(trend.changeKg, 2) })}</span>
        ) : (
          <span className="text-right text-xs text-muted">{fmt(d.trendNeedData, { n: Math.max(1, 8 - daysWithData) })}</span>
        )}
      </div>
      {visible.length > 0 && (
        <Suspense fallback={<div className="h-44" />}>
          <WeightChart entries={visible} target={target} />
        </Suspense>
      )}
      <div className="mt-3">
        <Segmented<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: d.range30 },
            { value: '90', label: d.range90 },
            { value: 'all', label: d.rangeAll },
          ]}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-xl font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

function NutritionCard({ targets }: { targets: Targets }) {
  const today = todayISO();
  const items = useLiveQuery(async () => Object.values(await dayItems(today)).flat(), [today]);
  if (!items) return null;
  return (
    <Card>
      <CardTitle
        icon={<Flame size={18} />}
        action={
          <Link to="/nutrition" className="text-sm font-semibold text-accent-text">
            {t.nutrition.addFood}
          </Link>
        }
      >
        {d.nutritionTitle}
      </CardTitle>
      <DaySummary items={items} targets={targets} />
      {items.length === 0 && <p className="mt-3 text-xs text-muted">{d.noMealsYet}</p>}
      <div className="mt-4 border-t border-line pt-4">
        <WaterTracker date={today} targetMl={targets.waterMl} />
      </div>
    </Card>
  );
}

function WeekCard() {
  const today = todayISO();
  const monday = startOfWeek(today);
  const stats = useLiveQuery(async () => {
    const [sessions, runs, scheduled, allSessions, allRuns, rest] = await Promise.all([
      db.workoutSessions.where('date').between(monday, today, true, true).filter((s) => s.endedAt !== undefined).count(),
      db.runs.where('date').between(monday, today, true, true).toArray(),
      db.scheduledActivities.where('date').between(monday, addDays(monday, 6), true, true).toArray(),
      db.workoutSessions.filter((s) => s.endedAt !== undefined).toArray(),
      db.runs.toArray(),
      db.scheduledActivities.where('kind').equals('rest').toArray(),
    ]);
    const records = runRecords(allRuns);
    const lifts = await allRecords();
    return {
      sessions,
      plannedWorkouts: scheduled.filter((a) => a.kind === 'workout' && a.status !== 'skipped').length,
      hasPlan: scheduled.length > 0,
      km: runs.reduce((s, r) => s + r.distanceKm, 0),
      sec: runs.reduce((s, r) => s + r.durationSec, 0),
      streak: activityStreak([...allSessions.map((s) => s.date), ...allRuns.map((r) => r.date)], today, rest.map((r) => r.date)),
      best5k: records['5k'],
      longest: records.longest,
      topLift: lifts[0],
    };
  }, [monday, today]);
  if (!stats) return null;
  const empty = !stats.topLift && !stats.longest;
  return (
    <Card>
      <CardTitle
        icon={<CalendarCheck size={18} />}
        action={
          <Link to="/planning" className="text-sm font-semibold text-accent-text">
            {t.planning.title}
          </Link>
        }
      >
        {d.weekTitle}
      </CardTitle>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link to="/muscu" className="rounded-2xl bg-surface-2 px-3 py-2.5 active:bg-line">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Dumbbell size={14} /> {d.workouts}
          </p>
          <p className="num text-xl font-semibold">
            {stats.sessions}
            <span className="text-sm font-normal text-muted"> / {stats.plannedWorkouts}</span>
          </p>
        </Link>
        <Link to="/course" className="rounded-2xl bg-surface-2 px-3 py-2.5 active:bg-line">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Footprints size={14} /> {d.runs}
          </p>
          <p className="num text-xl font-semibold">
            {num(stats.km, 1)}
            <span className="text-sm font-normal text-muted"> km · {Math.round(stats.sec / 60)} min</span>
          </p>
        </Link>
        <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Flame size={14} /> {d.streak}
          </p>
          <p className="num text-xl font-semibold">
            {stats.streak}
            <span className="text-sm font-normal text-muted"> {d.streakDays}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Trophy size={14} /> {d.records}
          </p>
          {empty ? (
            <p className="text-xs text-muted">{d.noRecords}</p>
          ) : (
            <div className="num text-xs leading-relaxed">
              {stats.topLift && (
                <p className="truncate">
                  {stats.topLift.exercise.name} : <span className="font-semibold">{num(stats.topLift.bestWeightKg)} kg</span>
                </p>
              )}
              {stats.best5k && (
                <p>
                  5 km : <span className="font-semibold">{formatDuration(stats.best5k.sec)}</span>
                </p>
              )}
              {!stats.best5k && stats.longest && (
                <p>
                  {t.run.longest} : <span className="font-semibold">{num(stats.longest.distanceKm)} km</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {!stats.hasPlan && (
        <Link to="/planning" className="flex items-center justify-between rounded-2xl bg-accent-soft px-3.5 py-3 text-sm font-semibold text-accent-text">
          {d.planWeek}
          <ChevronRight size={18} />
        </Link>
      )}
    </Card>
  );
}
