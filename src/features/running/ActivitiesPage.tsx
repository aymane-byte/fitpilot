import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Flag } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Card';
import { Segmented } from '@/components/Segmented';
import { db } from '@/db/db';
import type { Run } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { formatDateFr, todayISO } from '@/lib/dates';
import { periodRange } from '@/lib/runGoals';
import { formatDuration, formatPace, paceSecPerKm, sumDistance } from '@/lib/running';
import { RUN_TYPES } from '@/lib/runTypes';
import { MiniMap } from './MiniMap';

const g = t.gpsx;
const r = t.run;
type Period = 'all' | 'week' | 'month' | 'year';
type Sort = 'recent' | 'oldest' | 'distance' | 'pace' | 'duration';

export function filterRuns(runs: Run[], period: Period, type: string, sort: Sort, today = todayISO()): Run[] {
  let list = runs;
  if (period !== 'all') {
    const { start, end } = periodRange(period, today);
    list = list.filter((x) => x.date >= start && x.date <= end);
  }
  if (type !== 'all') list = list.filter((x) => x.type === type);
  const pace = (x: Run) => paceSecPerKm(x.distanceKm, x.durationSec);
  const byDate = (a: Run, b: Run) => a.date.localeCompare(b.date) || (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt);
  const cmp: Record<Sort, (a: Run, b: Run) => number> = {
    recent: (a, b) => byDate(b, a),
    oldest: byDate,
    distance: (a, b) => b.distanceKm - a.distanceKm,
    pace: (a, b) => pace(a) - pace(b),
    duration: (a, b) => b.durationSec - a.durationSec,
  };
  return [...list].sort(cmp[sort]);
}

export function RunRow({ run }: { run: Run }) {
  return (
    <li>
      <Link to={`/course/${run.id}`} className="flex min-h-18 items-center gap-3 px-4 py-2.5 active:bg-surface-2" data-testid="activity-row">
        {run.preview?.length ? (
          <MiniMap preview={run.preview} label={r.route} />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" title={g.noMap}>
            <Flag size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{run.name ?? r.types[run.type]}</span>
          <span className="num block text-sm">
            {num(run.distanceKm, 2)} km · {formatDuration(run.durationSec)} · {formatPace(paceSecPerKm(run.distanceKm, run.durationSec))}
            {r.perKm}
          </span>
          <span className="block truncate text-xs text-muted">
            {formatDateFr(run.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {r.types[run.type]}
            {run.elevGainM ? ` · +${run.elevGainM} m` : ''}
          </span>
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
    </li>
  );
}

/** Historique des activités : mini-carte, filtres (période, type) et tri. */
export function ActivitiesPage() {
  const runs = useLiveQuery(() => db.runs.toArray());
  const [period, setPeriod] = useState<Period>('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState<Sort>('recent');
  const list = useMemo(() => (runs ? filterRuns(runs, period, type, sort) : []), [runs, period, type, sort]);
  if (!runs) return null;
  return (
    <>
      <PageHeader title={g.historyTitle} back />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-28">
        <Segmented value={period} onChange={setPeriod} options={(['all', 'week', 'month', 'year'] as const).map((v) => ({ value: v, label: g.period[v] }))} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-muted">
            {r.type}
            <select value={type} onChange={(e) => setType(e.target.value)} className="min-h-11 rounded-2xl border border-line bg-surface-2 px-3 text-fg">
              <option value="all">{g.allTypes}</option>
              {RUN_TYPES.map((v) => (
                <option key={v} value={v}>
                  {r.types[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted">
            {g.sort}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-2xl border border-line bg-surface-2 px-3 text-fg">
              {(Object.keys(g.sorts) as Sort[]).map((v) => (
                <option key={v} value={v}>
                  {g.sorts[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="num text-sm text-muted" data-testid="activities-count">
          {fmt(g.count, { n: list.length, label: list.length > 1 ? g.activities : g.activity, km: num(sumDistance(list)), time: formatDuration(list.reduce((s, x) => s + x.durationSec, 0)) })}
        </p>
        {list.length === 0 ? (
          <Notice>{g.none}</Notice>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {list.map((x) => (
              <RunRow key={x.id} run={x} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
