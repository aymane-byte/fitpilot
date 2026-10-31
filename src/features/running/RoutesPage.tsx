import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Route, Trash2, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { LazyTrendChart } from '@/components/LazyTrendChart';
import { db } from '@/db/db';
import { fmt, num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { formatDuration, formatPace, paceSecPerKm } from '@/lib/running';
import { MiniMap } from './MiniMap';
import { routeRuns } from './service';

const g = t.gpsx;

/** Liste des parcours favoris avec le nombre de passages et le record. */
export function RoutesPage() {
  const data = useLiveQuery(async () => ({ routes: await db.routes.toArray(), runs: await db.runs.toArray() }));
  if (!data) return null;
  return (
    <>
      <PageHeader title={g.routesTitle} back />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-28">
        <p className="text-sm text-muted">{g.routesIntro}</p>
        {data.routes.length === 0 ? (
          <Notice icon={<Route size={16} />}>{g.routesEmpty}</Notice>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {data.routes.map((rt) => {
              const list = routeRuns(rt, data.runs);
              return (
                <li key={rt.id}>
                  <Link to={`/course/parcours/${rt.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-surface-2" data-testid="route-row">
                    <MiniMap preview={rt.preview} label={rt.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{rt.name}</span>
                      <span className="num block text-sm text-muted">
                        {num(rt.distanceM / 1000, 2)} km · {fmt(g.routeRuns, { n: list.length })}
                      </span>
                      {list[0] && <span className="num block text-xs text-accent-text">{fmt(g.routeBest, { time: formatDuration(list[0].durationSec) })}</span>}
                    </span>
                    <ChevronRight size={18} className="text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

/** Un parcours : passages du plus rapide au plus lent, écart au record, évolution des temps. */
export function RouteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const data = useLiveQuery(async () => ({ route: (await db.routes.get(Number(id))) ?? null, runs: await db.runs.toArray() }), [id]);
  if (!data) return null;
  if (!data.route) return <Navigate />;
  const route = data.route;
  const list = routeRuns(route, data.runs);
  const best = list[0];
  const chrono = [...list].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <PageHeader title={route.name} subtitle={`${num(route.distanceM / 1000, 2)} km`} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Card className="flex items-center gap-4">
          <MiniMap preview={route.preview} size={96} label={route.name} />
          <div>
            <p className="num text-sm text-muted">{fmt(g.routeRuns, { n: list.length })}</p>
            {best && (
              <p className="num flex items-center gap-1.5 text-lg font-semibold">
                <Trophy size={18} className="text-accent-text" /> {formatDuration(best.durationSec)}
              </p>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>{g.routeTitleRuns}</CardTitle>
          {list.length === 0 ? (
            <p className="text-sm text-muted">{g.routeNoRuns}</p>
          ) : (
            <ol className="divide-y divide-line" data-testid="route-runs">
              {list.map((x, i) => (
                <li key={x.id}>
                  <Link to={`/course/${x.id}`} className="flex items-center gap-3 py-2.5">
                    <span className={`num grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i === 0 ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="num block font-semibold">{formatDuration(x.durationSec)}</span>
                      <span className="num block text-xs text-muted">
                        {formatDateFr(x.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatPace(paceSecPerKm(x.distanceKm, x.durationSec))}
                        {t.run.perKm}
                      </span>
                    </span>
                    {i > 0 && best && <span className="num text-xs text-muted">{fmt(g.routeGap, { gap: formatDuration(x.durationSec - best.durationSec) })}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        {chrono.length >= 2 && (
          <Card>
            <CardTitle>{t.run.paceChart}</CardTitle>
            <LazyTrendChart labels={chrono.map((x) => formatDateFr(x.date))} values={chrono.map((x) => x.durationSec)} format={(v) => formatDuration(v)} invert ariaLabel={g.routeTitleRuns} />
          </Card>
        )}
        <Button variant="danger" block onClick={() => setDeleting(true)} icon={<Trash2 size={18} />}>
          {g.routeDelete}
        </Button>
      </main>
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={g.routeDelete}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await db.routes.delete(route.id!);
          navigate('/course/parcours', { replace: true });
        }}
      >
        {g.routeDeleteConfirm}
      </ConfirmSheet>
    </>
  );
}

function Navigate() {
  return (
    <>
      <PageHeader title={g.routesTitle} back />
      <main className="mx-auto max-w-lg px-4">
        <Notice>{g.routesEmpty}</Notice>
      </main>
    </>
  );
}
