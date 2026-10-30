import { useState } from 'react';
import { Activity, ChevronDown, Gauge, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { LazyMultiLineChart } from '@/components/LazyTrendChart';
import { fmt, num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { formatDuration, formatPace } from '@/lib/running';
import { predictTime, PREDICTION_DISTANCES } from '@/lib/vdot';
import { useRunInsights } from './useRunInsights';

const x = t.runx;

export function FormPage() {
  const ins = useRunInsights();
  const [how, setHow] = useState(false);
  if (!ins) return null;
  const last90 = ins.series.slice(-90);
  const d = ins.today;

  return (
    <>
      <PageHeader title={x.formTitle} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Card>
          <CardTitle icon={<Activity size={18} />}>{x.loadTitle}</CardTitle>
          {d ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([[x.ctl, d.ctl], [x.atl, d.atl], [x.tsb, d.tsb]] as [string, number][]).map(([label, v]) => (
                  <div key={label} className="rounded-2xl bg-surface-2 p-2.5">
                    <p className="text-[11px] text-muted">{label}</p>
                    <p className="num text-2xl font-bold" data-testid={`load-${label}`}>{num(v, 0)}</p>
                  </div>
                ))}
              </div>
              {ins.zone && <p className="mt-3 text-[15px]">{x.zones[ins.zone]}</p>}
              {ins.ramp !== null && ins.ramp > 8 && (
                <div className="mt-3">
                  <Notice tone="warning" icon={<TriangleAlert size={16} />}>
                    {fmt(x.ramp, { v: num(ins.ramp) })}
                  </Notice>
                </div>
              )}
              <p className="mb-2 mt-4 text-xs font-medium text-muted">{x.last90}</p>
              <LazyMultiLineChart
                ariaLabel={x.loadTitle}
                labels={last90.map((s) => formatDateFr(s.date))}
                series={[
                  { label: `${x.ctl} (CTL)`, values: last90.map((s) => s.ctl), colorVar: '--accent-text' },
                  { label: `${x.atl} (ATL)`, values: last90.map((s) => s.atl), colorVar: '--danger' },
                  { label: `${x.tsb} (TSB)`, values: last90.map((s) => s.tsb), colorVar: '--info', dashed: true },
                ]}
                format={(v) => num(v, 0)}
              />
              <p className="mt-2 text-xs text-muted">{fmt(x.loadBasis, { rpe: ins.basis.rpe, pace: ins.basis.pace, type: ins.basis.type })}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{x.loadEmpty}</p>
          )}
          <button type="button" onClick={() => setHow((v) => !v)} aria-expanded={how} className="mt-3 flex min-h-11 w-full items-center justify-between text-left text-sm font-medium text-accent-text">
            {x.loadHowTitle}
            <ChevronDown size={18} className={`transition ${how ? 'rotate-180' : ''}`} />
          </button>
          {how && (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
              {x.loadHow.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle icon={<Gauge size={18} />}>{x.vdotTitle}</CardTitle>
          {ins.vdot && ins.paces ? (
            <>
              <p className="text-sm text-muted">{x.vdot}</p>
              <p className="num text-4xl font-bold" data-testid="vdot">
                {num(ins.vdot.vdot)} <span className="text-sm font-medium text-muted">({t.common.estimate})</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {fmt(x.vdotFrom, { label: ins.vdot.from.label, time: formatDuration(ins.vdot.from.sec), date: formatDateFr(ins.vdot.from.date, { day: 'numeric', month: 'long' }) })}
              </p>
              <h3 className="mb-2 mt-4 text-sm font-semibold">{x.predictions}</h3>
              <div className="grid grid-cols-2 gap-2">
                {PREDICTION_DISTANCES.map((p) => {
                  const sec = predictTime(ins.vdot!.vdot, p.m);
                  return (
                    <div key={p.key} className="rounded-2xl bg-surface-2 p-3">
                      <p className="text-xs text-muted">{p.label}</p>
                      <p className="num text-xl font-semibold" data-testid={`pred-${p.key}`}>≈ {formatDuration(sec)}</p>
                      <p className="num text-[11px] text-muted">{formatPace(sec / (p.m / 1000))} {t.run.perKm}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">{x.predictionsNote}</p>
              <h3 className="mb-2 mt-4 text-sm font-semibold">{x.paces}</h3>
              <ul className="divide-y divide-line text-sm">
                {(
                  [
                    [x.paceEasy, `${formatPace(ins.paces.easy[0])} – ${formatPace(ins.paces.easy[1])}`],
                    [x.paceMarathon, formatPace(ins.paces.marathon)],
                    [x.paceThreshold, formatPace(ins.paces.threshold)],
                    [x.paceInterval, formatPace(ins.paces.interval)],
                    [x.paceRep, formatPace(ins.paces.repetition)],
                  ] as [string, string][]
                ).map(([label, v]) => (
                  <li key={label} className="flex justify-between py-2">
                    <span className="text-muted">{label}</span>
                    <span className="num font-semibold">{v} {t.run.perKm}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">{x.vdotEmpty}</p>
          )}
        </Card>
      </main>
    </>
  );
}
