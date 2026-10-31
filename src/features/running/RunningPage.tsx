import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, CalendarDays, Route, ChevronLeft, ChevronRight, FileUp, Flag, Footprints, ListOrdered, Map as MapIcon, MapPin, Plus, Target, Timer, TrendingUp, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { NumberField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { LazyTrendChart } from '@/components/LazyTrendChart';
import { useToast } from '@/components/Toast';
import { db, updateSettings } from '@/db/db';
import type { Run } from '@/db/types';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { addDays, formatDateFr, parseISODate, startOfWeek, toISODate, todayISO } from '@/lib/dates';
import { formatDuration, formatPace, paceSecPerKm, RECORD_KEYS, runRecords, sumDistance } from '@/lib/running';
import { planWeek, RUN_PLANS } from '@/lib/runPlans';
import { GOAL_TYPES, goalProgress, shoeKm, shoeStatus, type GoalPeriod } from '@/lib/runGoals';
import { RunEntrySheet } from './RunEntrySheet';
import { ImportRunSheet } from './ImportRunSheet';
import { ensureRunAnalysis } from './service';
import { useRunInsights } from './useRunInsights';
import { RunRow } from './ActivitiesPage';

const x = t.runx;

const r = t.run;

export function RunningPage() {
  const runs = useLiveQuery(() => db.runs.orderBy('date').toArray());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  // Courses enregistrées avec une ancienne analyse : recalcul (nouvelles distances de records, dénivelé).
  useEffect(() => {
    void ensureRunAnalysis();
  }, []);
  if (!runs) return null;
  const today = todayISO();
  const monday = startOfWeek(today);
  const monthStart = today.slice(0, 8) + '01';
  const week = runs.filter((x) => x.date >= monday && x.date <= today);
  const month = runs.filter((x) => x.date >= monthStart && x.date <= today);

  return (
    <>
      <PageHeader title={r.title} />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <div className="grid grid-cols-2 gap-3">
          <Summary label={r.week} runs={week} />
          <Summary label={r.month} runs={month} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="secondary" onClick={() => setAdding(true)} icon={<Plus size={18} />}>
            {r.add}
          </Button>
          <Link to="/course/gps" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-accent px-5 font-semibold text-accent-ink active:brightness-90">
            <MapPin size={18} /> {r.gps}
          </Link>
        </div>
        <ToolsGrid onImport={() => setImporting(true)} />
        <ShoeAlerts />
        <FormSummary />
        <GoalsCard runs={runs} />
        <PlanCard />
        <RecordsCard runs={runs} />
        <PaceCard runs={runs} />
        <CalendarCard runs={runs} />
        <HistoryCard runs={runs} />
      </main>
      {adding && <RunEntrySheet open onClose={() => setAdding(false)} />}
      {importing && <ImportRunSheet open onClose={() => setImporting(false)} />}
    </>
  );
}

function Summary({ label, runs }: { label: string; runs: Run[] }) {
  return (
    <Card className="!p-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-2xl font-bold tracking-tight">
        {num(sumDistance(runs))} <span className="text-sm font-normal text-muted">km</span>
      </p>
      <p className="num text-xs text-muted">
        {runs.length} × · {formatDuration(runs.reduce((s, x) => s + x.durationSec, 0))}
      </p>
    </Card>
  );
}

function ToolsGrid({ onImport }: { onImport: () => void }) {
  const tile = 'flex min-h-20 flex-col items-start justify-center gap-1 rounded-2xl border border-line bg-surface p-3 active:bg-surface-2';
  const items: [string, ReactNode, string, string][] = [
    ['/course/forme', <Activity size={18} />, x.form, x.formHint],
    ['/course/carte', <MapIcon size={18} />, x.map, x.mapHint],
    ['/course/seances', <Timer size={18} />, x.workouts, x.workoutsHint],
    ['/course/chaussures', <Footprints size={18} />, x.shoes, x.shoesHint],
    ['/course/parcours', <Route size={18} />, t.gpsx.routes, t.gpsx.routesHint],
    ['/course/activites', <ListOrdered size={18} />, t.gpsx.historyTitle, `${t.gpsx.period.week} · ${t.gpsx.period.month} · ${t.gpsx.period.year}`],
  ];
  return (
    <nav aria-label={x.tools} className="grid grid-cols-2 gap-2">
      {items.map(([to, icon, label, hint]) => (
        <Link key={to} to={to} className={tile}>
          <span className="flex items-center gap-2 font-semibold">
            <span className="text-accent-text">{icon}</span>
            {label}
          </span>
          <span className="text-xs text-muted">{hint}</span>
        </Link>
      ))}
      <button type="button" onClick={onImport} className="col-span-2 flex min-h-13 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-left active:bg-surface-2">
        <span className="text-accent-text"><FileUp size={18} /></span>
        <span className="font-semibold">{x.import}</span>
        <span className="text-xs text-muted">· {x.importHint}</span>
      </button>
    </nav>
  );
}

function ShoeAlerts() {
  const data = useLiveQuery(async () => ({ shoes: await db.shoes.filter((s) => !s.retired).toArray(), runs: await db.runs.toArray() }));
  if (!data) return null;
  const worn = data.shoes.map((s) => ({ s, km: shoeKm(s, data.runs) })).filter(({ s, km }) => shoeStatus(km, s.alertKm) !== 'ok');
  if (!worn.length) return null;
  return (
    <Link to="/course/chaussures" className="block">
      <Notice tone="warning" icon={<Footprints size={16} />}>
        {worn.map(({ s, km }) => fmt(x.shoeAlert, { name: s.name, km: num(km, 0) })).join(' ')}
      </Notice>
    </Link>
  );
}

function FormSummary() {
  const ins = useRunInsights();
  if (!ins?.today) return null;
  const d = ins.today;
  const cells: [string, number][] = [[x.ctl, d.ctl], [x.atl, d.atl], [x.tsb, d.tsb]];
  return (
    <Link to="/course/forme" className="block">
      <Card className="active:bg-surface-2">
        <CardTitle icon={<Activity size={18} />} action={<ChevronRight size={18} className="text-muted" />}>
          {x.loadTitle}
        </CardTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          {cells.map(([label, v]) => (
            <div key={label} className="rounded-2xl bg-surface-2 p-2.5">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="num text-lg font-semibold">{num(v, 0)}</p>
            </div>
          ))}
        </div>
        {ins.zone && <p className="mt-2 text-sm text-muted">{x.zones[ins.zone]}</p>}
        {ins.vdot && (
          <p className="num mt-1 text-sm">
            {x.vdot} : <span className="font-semibold">{num(ins.vdot.vdot)}</span>
          </p>
        )}
      </Card>
    </Link>
  );
}

const PERIODS: GoalPeriod[] = ['week', 'month', 'year'];
const GOAL_MAX: Record<GoalPeriod, number> = { week: 300, month: 1200, year: 10_000 };

function GoalsCard({ runs }: { runs: Run[] }) {
  const toast = useToast();
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').toArray());
  const [editing, setEditing] = useState<GoalPeriod | null>(null);
  const [value, setValue] = useState<number>();
  if (!goals) return null;
  const today = todayISO();
  const goalOf = (p: GoalPeriod) => goals.find((g) => g.type === GOAL_TYPES[p]);

  async function save(period: GoalPeriod, target: number | undefined) {
    await db.transaction('rw', db.goals, async () => {
      await db.goals.where('type').equals(GOAL_TYPES[period]).filter((g) => g.status === 'active').modify({ status: 'abandoned' });
      if (target) await db.goals.add({ type: GOAL_TYPES[period], target, status: 'active' });
    });
    toast(r.goalSaved);
    setEditing(null);
  }

  const active = PERIODS.filter((p) => goalOf(p));
  return (
    <Card>
      <CardTitle icon={<Target size={18} />}>{x.goalsTitle}</CardTitle>
      {active.length === 0 && <p className="mb-3 text-sm text-muted">{x.noGoals}</p>}
      <div className="flex flex-col gap-3">
        {active.map((p) => {
          const g = goalProgress(p, goalOf(p)!.target, runs, today);
          const progressText = fmt(r.goalProgress, { done: num(g.doneKm), target: num(g.target) });
          return (
            <button
              key={p}
              type="button"
              data-testid={`goal-${p}`}
              onClick={() => {
                setValue(g.target);
                setEditing(p);
              }}
              className="rounded-2xl bg-surface-2 p-3 text-left active:bg-line"
            >
              <span className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="font-semibold">{x.periods[p]}</span>
                <span className="num text-sm">{progressText}</span>
              </span>
              <span className="block h-2.5 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${g.pct}%` }} />
              </span>
              <span className="num mt-1.5 block text-xs text-muted">
                <span className={g.status === 'behind' ? 'text-warning' : 'text-accent-text'}>{g.status === 'done' ? x.goalDone : g.status === 'ahead' ? x.goalAhead : x.goalBehind}</span>
                {g.status !== 'done' && <> · {fmt(x.goalLeft, { km: num(g.remainingKm), days: g.daysLeft })}</>}
              </span>
              {g.status !== 'done' && <span className="num block text-xs text-muted">{fmt(x.goalExpected, { expected: num(g.expectedKm), projected: num(g.projectedKm) })}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PERIODS.filter((p) => !goalOf(p)).map((p) => (
          <Button
            key={p}
            size="sm"
            variant="secondary"
            icon={<Plus size={16} />}
            onClick={() => {
              setValue(undefined);
              setEditing(p);
            }}
          >
            {x.periods[p]}
          </Button>
        ))}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `${x.goalsTitle} · ${x.periods[editing]}` : ''}>
        {editing && (
          <div className="flex flex-col gap-4">
            <NumberField label={x.goalKm} unit="km" value={value} onChange={setValue} autoFocus />
            <Button size="lg" block onClick={() => save(editing, value)} disabled={!value || value <= 0 || value > GOAL_MAX[editing]}>
              {t.common.save}
            </Button>
            {goalOf(editing) && (
              <Button size="lg" variant="secondary" block onClick={() => save(editing, undefined)}>
                {x.goalRemove}
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </Card>
  );
}

function PlanCard() {
  const settings = useSettings();
  const toast = useToast();
  const [browsing, setBrowsing] = useState(false);
  if (!settings) return null;
  const active = settings.runPlan ? RUN_PLANS.find((p) => p.key === settings.runPlan!.key) : undefined;
  const wk = active ? planWeek(active, settings.runPlan!.start, todayISO()) : null;

  async function follow(key: string) {
    // Le plan démarre le lundi de la semaine en cours.
    await updateSettings({ runPlan: { key, start: startOfWeek(todayISO()) } });
    toast(r.planStarted);
    setBrowsing(false);
  }

  return (
    <Card>
      <CardTitle icon={<Flag size={18} />} action={<Button size="sm" variant="secondary" onClick={() => setBrowsing(true)}>{active ? r.changePlan : r.choosePlan}</Button>}>
        {active ? active.name : r.plans}
      </CardTitle>
      {active ? (
        wk ? (
          <>
            <p className="mb-2 text-sm font-medium text-accent-text">{fmt(r.planWeek, { n: wk.index + 1, total: active.weeks.length })}</p>
            <ul className="flex flex-col gap-2">
              {wk.sessions.map((s, i) => (
                <li key={i} className="rounded-2xl bg-surface-2 p-3">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-muted">{s.detail}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Notice>{r.planDone}</Notice>
        )
      ) : (
        <p className="text-sm text-muted">{RUN_PLANS.map((p) => p.name).join(' · ')}</p>
      )}
      <Sheet open={browsing} onClose={() => setBrowsing(false)} title={r.plans}>
        <div className="flex flex-col gap-3">
          {RUN_PLANS.map((p) => {
            const isActive = settings.runPlan?.key === p.key;
            return (
              <div key={p.key} className={`rounded-2xl border p-3.5 ${isActive ? 'border-accent-text bg-accent-soft' : 'border-line bg-surface-2'}`}>
                <p className="font-semibold">{p.name}</p>
                <p className="mb-1 text-sm text-muted">{p.description}</p>
                <p className="mb-3 text-xs text-muted">{fmt(r.planMeta, { n: p.weeks[0].length, w: p.weeks.length })}</p>
                {isActive ? (
                  <Button size="sm" variant="secondary" block onClick={async () => { await updateSettings({ runPlan: undefined }); setBrowsing(false); }}>
                    {r.stopPlan}
                  </Button>
                ) : (
                  <Button size="sm" block onClick={() => follow(p.key)}>
                    {r.followPlan}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Sheet>
    </Card>
  );
}

function RecordsCard({ runs }: { runs: Run[] }) {
  const recs = useMemo(() => runRecords(runs), [runs]);
  const rows = RECORD_KEYS.map((k) => [k, x.records[k]] as const);
  return (
    <Card>
      <CardTitle icon={<Trophy size={18} />}>{r.records}</CardTitle>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([key, label]) => {
          const rec = recs[key];
          return (
            <div key={key} className="rounded-2xl bg-surface-2 p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="num text-xl font-semibold">{rec ? formatDuration(rec.sec) : '—'}</p>
              {rec && <p className="text-[11px] text-muted">{rec.measured ? r.measuredRecord : r.estimatedRecord} · {formatDateFr(rec.date)}</p>}
            </div>
          );
        })}
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="text-xs text-muted">{r.longest}</p>
          <p className="num text-xl font-semibold">{recs.longest ? `${num(recs.longest.distanceKm)} km` : '—'}</p>
          {recs.longest && <p className="text-[11px] text-muted">{formatDateFr(recs.longest.date)}</p>}
        </div>
      </div>
      {runs.length > 0 && <p className="mt-2 text-xs text-muted">{r.recordsNote}</p>}
    </Card>
  );
}

function PaceCard({ runs }: { runs: Run[] }) {
  const last = runs.slice(-20);
  return (
    <Card>
      <CardTitle icon={<TrendingUp size={18} />}>{r.paceChart}</CardTitle>
      {last.length < 2 ? (
        <p className="text-sm text-muted">{r.paceChartEmpty}</p>
      ) : (
        <LazyTrendChart
          labels={last.map((x) => formatDateFr(x.date))}
          values={last.map((x) => Math.round(paceSecPerKm(x.distanceKm, x.durationSec)))}
          format={(v) => formatPace(v)}
          invert
          ariaLabel={r.paceChart}
        />
      )}
    </Card>
  );
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function CalendarCard({ runs }: { runs: Run[] }) {
  const [offset, setOffset] = useState(0);
  const today = todayISO();
  const base = parseISODate(today);
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const firstISO = toISODate(first);
  const gridStart = startOfWeek(firstISO);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const km = new Map<string, number>();
  for (const x of runs) km.set(x.date, (km.get(x.date) ?? 0) + x.distanceKm);
  const cells = Array.from({ length: Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7) * 7 }, (_, i) => addDays(gridStart, i));
  const monthKey = firstISO.slice(0, 7);
  const monthTotal = sumDistance(runs.filter((x) => x.date.startsWith(monthKey)));

  return (
    <Card>
      <CardTitle
        icon={<CalendarDays size={18} />}
        action={
          <div className="flex items-center">
            <button type="button" aria-label={r.prevMonth} onClick={() => setOffset((o) => o - 1)} className="grid size-10 place-items-center rounded-full text-muted active:bg-surface-2">
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label={r.nextMonth} disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} className="grid size-10 place-items-center rounded-full text-muted active:bg-surface-2 disabled:opacity-30">
              <ChevronRight size={18} />
            </button>
          </div>
        }
      >
        <span className="first-letter:uppercase">{formatDateFr(firstISO, { month: 'long', year: 'numeric' })}</span>
      </CardTitle>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="pb-1 text-[11px] font-medium text-muted">{d}</span>
        ))}
        {cells.map((d) => {
          const inMonth = d.startsWith(monthKey);
          const k = km.get(d);
          return (
            <div
              key={d}
              aria-label={k ? `${formatDateFr(d)} : ${num(k)} km` : undefined}
              className={`relative grid aspect-square place-items-center rounded-xl text-sm ${!inMonth ? 'opacity-30' : ''} ${k ? 'bg-accent font-semibold text-accent-ink' : 'bg-surface-2'} ${d === today ? 'ring-2 ring-accent-text' : ''}`}
            >
              {/* Jours hors du mois : case vide (pas de texte peu contrasté). */}
              {inMonth && <span className="num">{Number(d.slice(8))}</span>}
            </div>
          );
        })}
      </div>
      <p className="num mt-3 text-sm text-muted">{num(monthTotal)} km</p>
    </Card>
  );
}

function HistoryCard({ runs }: { runs: Run[] }) {
  const list = [...runs].sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt)).slice(0, 5);
  return (
    <Card>
      <CardTitle
        icon={<ListOrdered size={18} />}
        action={
          runs.length > 0 && (
            <Link to="/course/activites" className="text-sm font-semibold text-accent-text">
              {t.gpsx.historyAll}
            </Link>
          )
        }
      >
        {r.history}
      </CardTitle>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{r.noRuns}</p>
      ) : (
        <ul className="-mx-4 -mb-4 divide-y divide-line">
          {list.map((x) => (
            <RunRow key={x.id} run={x} />
          ))}
        </ul>
      )}
    </Card>
  );
}
