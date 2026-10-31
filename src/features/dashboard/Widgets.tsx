// Widgets du tableau de bord pour les données avancées : forme de course, objectifs de distance,
// chaussures, micronutriments du jour.
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, ChevronRight, Footprints, Leaf } from 'lucide-react';
import { Card, CardTitle, Notice } from '@/components/Card';
import { db } from '@/db/db';
import type { MealItem, Profile } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { todayISO } from '@/lib/dates';
import { GOAL_TYPES, goalProgress, shoeKm, shoeStatus, type GoalPeriod } from '@/lib/runGoals';
import { microStatus, microTargets, type MicroKey } from '@/lib/micros';
import { useRunInsights } from '../running/useRunInsights';
import { microsOfItems } from '../nutrition/service';

const x = t.runx;
const PERIODS: GoalPeriod[] = ['week', 'month', 'year'];

/** Forme / fatigue / fraîcheur, VDOT, objectifs de distance et alerte chaussures. */
export function RunInsightsCard() {
  const ins = useRunInsights();
  const extra = useLiveQuery(async () => ({ goals: await db.goals.where('status').equals('active').toArray(), shoes: await db.shoes.filter((s) => !s.retired).toArray() }));
  if (!ins || !extra) return null;
  const goals = PERIODS.map((p) => ({ p, g: extra.goals.find((g) => g.type === GOAL_TYPES[p]) })).filter((x) => x.g);
  const worn = extra.shoes.map((s) => ({ s, km: shoeKm(s, ins.runs) })).filter(({ s, km }) => shoeStatus(km, s.alertKm) !== 'ok');
  if (!ins.today && !goals.length && !worn.length) return null;
  const d = ins.today;
  return (
    <Card data-testid="run-insights">
      <CardTitle icon={<Activity size={18} />} action={<Link to="/course/forme" aria-label={x.formTitle} className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2"><ChevronRight size={18} /></Link>}>
        {x.loadTitle}
      </CardTitle>
      {d && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([[x.ctl, d.ctl], [x.atl, d.atl], [x.tsb, d.tsb]] as [string, number][]).map(([label, v]) => (
              <div key={label} className="rounded-2xl bg-surface-2 py-2">
                <p className="text-[11px] text-muted">{label}</p>
                <p className="num text-lg font-semibold">{num(v, 0)}</p>
              </div>
            ))}
          </div>
          {ins.zone && <p className="mt-2 text-sm text-muted">{x.zones[ins.zone]}</p>}
          {ins.vdot && (
            <p className="num mt-1 text-sm">
              {x.vdot} : <span className="font-semibold">{num(ins.vdot.vdot)}</span> <span className="text-muted">({t.common.estimate})</span>
            </p>
          )}
        </>
      )}
      {goals.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {goals.map(({ p, g }) => {
            const pr = goalProgress(p, g!.target, ins.runs, todayISO());
            return (
              <li key={p}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{x.periods[p]}</span>
                  <span className="num text-muted">{fmt(t.run.goalProgress, { done: num(pr.doneKm), target: num(pr.target) })}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pr.pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {worn.length > 0 && (
        <div className="mt-3">
          <Notice tone="warning" icon={<Footprints size={16} />}>
            {worn.map(({ s, km }) => fmt(x.shoeAlert, { name: s.name, km: num(km, 0) })).join(' ')}
          </Notice>
        </div>
      )}
    </Card>
  );
}

const QUICK_MICROS: MicroKey[] = ['fiberG', 'saltG', 'sugarsG'];

/** Ligne de micronutriments du jour (fibres, sel, sucres) sous le résumé calories. */
export function MicrosLine({ items, profile, kcal }: { items: MealItem[]; profile: Profile; kcal: number }) {
  if (!items.length) return null;
  const totals = microsOfItems(items);
  const targets = microTargets(profile, kcal);
  return (
    <Link to="/nutrition" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface-2 px-3 py-2 text-xs" data-testid="micros-line">
      <Leaf size={14} className="text-accent-text" />
      {QUICK_MICROS.map((k) => {
        const st = microStatus(totals[k], targets[k]);
        return (
          <span key={k} className={st === 'high' ? 'font-semibold text-warning' : st === 'low' ? 'text-info' : 'text-muted'}>
            {t.nx.micros[k]} <span className="num">{st === 'unknown' ? '?' : `${num(totals[k].value, k === 'saltG' ? 1 : 0)} g`}</span>
          </span>
        );
      })}
    </Link>
  );
}
