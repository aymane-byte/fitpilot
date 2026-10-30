import { Moon } from 'lucide-react';
import { Card, CardTitle, Notice } from '@/components/Card';
import type { Settings } from '@/db/types';
import { fmt, t } from '@/i18n';
import { ramadanPlan } from '@/lib/dayTargets';

const x = t.nx;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;

/** Mode Ramadan : jeûne, plan d'eau ftour → s'hour, créneaux d'entraînement conseillés. */
export function RamadanCard({ settings, waterMl, compact }: { settings: Settings; waterMl: number; compact?: boolean }) {
  if (!settings.ramadan?.enabled) return null;
  const plan = ramadanPlan(settings.ramadan, waterMl);
  return (
    <Card data-testid="ramadan-card">
      <CardTitle icon={<Moon size={18} />}>{x.ramadanTitle}</CardTitle>
      {!plan ? (
        <Notice tone="warning">{x.ramadanTimesBad}</Notice>
      ) : (
        <>
          <p className="num text-sm">
            {fmt(x.fasting, { h: hm(plan.fastingMin) })} · {fmt(x.eating, { h: hm(plan.eatingMin) })}
          </p>
          {!compact && (
            <>
              <p className="mt-3 mb-1.5 text-sm font-semibold">{fmt(x.waterPlan, { ml: waterMl })}</p>
              <ul className="num flex flex-wrap gap-1.5 text-xs">
                {plan.water.map((w) => (
                  <li key={w.at} className="rounded-full bg-surface-2 px-2.5 py-1">
                    {w.at} · {w.ml} ml
                  </li>
                ))}
              </ul>
              <p className="mt-3 mb-1 text-sm font-semibold">{x.trainingSlots}</p>
              <ul className="flex flex-col gap-1 text-sm text-muted">
                {plan.training.map((s) => (
                  <li key={s.kind}>{fmt(s.kind === 'light' ? x.slotLight : x.slotIntense, { from: s.from, to: s.to })}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">{x.ramadanSafety}</p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
