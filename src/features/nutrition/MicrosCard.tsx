import { useState } from 'react';
import { ChevronDown, Leaf } from 'lucide-react';
import { Card, CardTitle } from '@/components/Card';
import type { Profile } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { MICRO_KEYS, MICRO_UNITS, microStatus, microTargets, sodiumMgFromSalt, type MicroKey, type MicroTotal } from '@/lib/micros';

const x = t.nx;

const digits = (k: MicroKey) => (k === 'vitDUg' || k === 'b12Ug' || k === 'saltG' ? 1 : 0);

/** Micronutriments du jour (ou moyenne) face aux repères, avec la part de données connues. */
export function MicrosCard({ totals, profile, kcal, title = x.microsTitle, defaultOpen = false }: { totals: Record<MicroKey, MicroTotal>; profile: Pick<Profile, 'gender' | 'age'>; kcal: number; title?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const targets = microTargets(profile, kcal);
  const flagged = MICRO_KEYS.filter((k) => ['low', 'high'].includes(microStatus(totals[k], targets[k])));
  const keys = open ? MICRO_KEYS : (['fiberG', 'saltG', 'sugarsG'] as MicroKey[]);
  return (
    <Card>
      <CardTitle icon={<Leaf size={18} />}>{title}</CardTitle>
      <ul className="flex flex-col gap-2.5" data-testid="micros">
        {keys.map((k) => {
          const tot = totals[k];
          const tg = targets[k];
          const st = microStatus(tot, tg);
          const pct = Math.min(100, (tot.value / tg.value) * 100);
          const bar = st === 'high' ? 'bg-warning' : st === 'low' ? 'bg-info' : st === 'unknown' ? 'bg-line' : 'bg-accent';
          return (
            <li key={k}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{x.micros[k]}</span>
                <span className="num text-xs">
                  {num(tot.value, digits(k))} {MICRO_UNITS[k]} · <span className="text-muted">{fmt(tg.kind === 'min' ? x.microMin : x.microMax, { v: `${tg.value} ${MICRO_UNITS[k]}` })}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                <span className={st === 'high' ? 'font-semibold text-warning' : st === 'low' ? 'font-semibold text-info' : ''}>{x.microStatus[st]}</span>
                {' · '}
                {fmt(x.microCoverage, { p: Math.round(tot.coverage * 100) })}
                {k === 'saltG' && tot.value > 0 && <> · {fmt(x.sodium, { mg: num(sodiumMgFromSalt(tot.value), 0) })}</>}
              </p>
            </li>
          );
        })}
      </ul>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-2 flex min-h-11 w-full items-center justify-between text-left text-sm font-medium text-accent-text">
        {open ? t.common.close : `${t.nx.microsTitle} (${MICRO_KEYS.length})${flagged.length ? ` · ${flagged.map((k) => x.micros[k]).join(', ')}` : ''}`}
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="text-xs text-muted">{x.microsNote}</p>}
    </Card>
  );
}
