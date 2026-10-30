import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChevronLeft, ChevronRight, Flag, ListOrdered, MapPin, Plus, Target, TrendingUp, Trophy } from 'lucide-react';
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
import { formatDuration, formatPace, paceSecPerKm, runRecords, sumDistance, type RecordDistance } from '@/lib/running';
import { planWeek, RUN_PLANS } from '@/lib/runPlans';
import { RunEntrySheet } from './RunEntrySheet';

const r = t.run;

export function RunningPage() {
  const runs = useLiveQuery(() => db.runs.orderBy('date').toArray());
  const [adding, setAdding] = useState(false);
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
        <GoalCard weekKm={sumDistance(week)} />
        <PlanCard />
        <RecordsCard runs={runs} />
        <PaceCard runs={runs} />
        <CalendarCard runs={runs} />
        <HistoryCard runs={runs} />
      </main>
      {adding && <RunEntrySheet open onClose={() => setAdding(false)} />}
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

function GoalCard({ weekKm }: { weekKm: number }) {
  const toast = useToast();
  const goal = useLiveQuery(async () => (await db.goals.where('type').equals('run_week_km').filter((g) => g.status === 'active').first()) ?? null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>();
  if (goal === undefined) return null;

  async function save() {
    if (!value || value <= 0 || value > 300) return;
    await db.transaction('rw', db.goals, async () => {
      await db.goals.where('type').equals('run_week_km').modify({ status: 'abandoned' });
      await db.goals.add({ type: 'run_week_km', target: value, status: 'active' });
    });
    toast(r.goalSaved);
    setEditing(false);
  }

  const pct = goal ? Math.min(100, (weekKm / goal.target) * 100) : 0;
  return (
    <Card>
      <CardTitle
        icon={<Target size={18} />}
        action={
          <Button size="sm" variant="secondary" onClick={() => { setValue(goal?.target); setEditing(true); }}>
            {goal ? r.editGoal : r.setGoal}
          </Button>
        }
      >
        {r.goals}
      </CardTitle>
      {goal ? (
        <>
          <p className="num mb-2 text-sm">{fmt(r.goalProgress, { done: num(weekKm), target: num(goal.target) })}</p>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">{r.noGoal}</p>
      )}
      <Sheet open={editing} onClose={() => setEditing(false)} title={r.goals}>
        <div className="flex flex-col gap-4">
          <NumberField label={r.goalKm} unit="km" value={value} onChange={setValue} autoFocus />
          <Button size="lg" block onClick={save} disabled={!value || value <= 0 || value > 300}>
            {t.common.save}
          </Button>
        </div>
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
  const rows: [RecordDistance, string][] = [['1k', r.best1k], ['5k', r.best5k], ['10k', r.best10k]];
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
  const list = [...runs].reverse().slice(0, 40);
  return (
    <Card>
      <CardTitle icon={<ListOrdered size={18} />}>{r.history}</CardTitle>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{r.noRuns}</p>
      ) : (
        <ul className="-mx-4 -mb-4 divide-y divide-line">
          {list.map((x) => (
            <li key={x.id}>
              <Link to={`/course/${x.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-surface-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">{x.source === 'gps' ? <MapPin size={18} /> : <Flag size={18} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="num block font-medium">
                    {num(x.distanceKm, 2)} km · {formatDuration(x.durationSec)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {formatDateFr(x.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {r.types[x.type]} · {formatPace(paceSecPerKm(x.distanceKm, x.durationSec))}
                    {r.perKm}
                  </span>
                </span>
                <ChevronRight size={18} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
