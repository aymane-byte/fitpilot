import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Droplet, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { NumberField } from '@/components/Field';
import { db } from '@/db/db';
import { num, t } from '@/i18n';
import type { ISODate } from '@/lib/dates';

/** Quantité libre acceptée (ml) : une gorgée à une grande bouteille. */
export const WATER_MIN_ML = 20;
export const WATER_MAX_ML = 2000;

/** Suivi de l'eau d'une journée : +150 / +250 / +500 ml, quantité libre, annulation du dernier ajout. */
export function WaterTracker({ date, targetMl }: { date: ISODate; targetMl: number }) {
  const logs = useLiveQuery(() => db.waterLogs.where('date').equals(date).sortBy('at'), [date]) ?? [];
  const total = logs.reduce((s, w) => s + w.ml, 0);
  const last = logs.at(-1);
  const add = (ml: number) => db.waterLogs.add({ date, ml, at: Date.now() });
  const [custom, setCustom] = useState(false);
  const [ml, setMl] = useState<number | undefined>(300);
  const valid = ml !== undefined && ml >= WATER_MIN_ML && ml <= WATER_MAX_ML;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Droplet size={18} className="text-info" />
          {t.dashboard.waterTitle}
        </h3>
        <span className="num text-sm" data-testid="water-total">
          {num(total, 0)} <span className="text-muted">/ {num(targetMl, 0)} ml</span>
        </span>
      </div>
      <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-info transition-[width] duration-500" style={{ width: `${Math.min(100, (total / targetMl) * 100)}%` }} />
      </div>
      <div className="flex gap-2">
        {[150, 250, 500].map((v) => (
          <Button key={v} variant="secondary" className="flex-1 !px-2" onClick={() => add(v)}>
            +{v} ml
          </Button>
        ))}
        <Button variant="secondary" className="!px-3" onClick={() => setCustom((c) => !c)} aria-expanded={custom} aria-label={t.dashboard.waterCustom}>
          <Plus size={18} />
        </Button>
        <Button variant="secondary" className="!px-3" onClick={() => last && db.waterLogs.delete(last.id!)} disabled={!last} aria-label={t.dashboard.waterUndo}>
          <Undo2 size={18} />
        </Button>
      </div>
      {custom && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            await add(Math.round(ml!));
            setCustom(false);
          }}
        >
          <div className="flex-1">
            <NumberField label={t.dashboard.waterCustomLabel} unit="ml" value={ml} onChange={setMl} integer error={ml !== undefined && !valid ? t.dashboard.waterCustomError : undefined} />
          </div>
          <Button type="submit" disabled={!valid}>
            {t.common.add}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Total d'eau d'une journée (pour les résumés). */
export function useWaterTotal(date: ISODate) {
  return useLiveQuery(async () => (await db.waterLogs.where('date').equals(date).toArray()).reduce((s, w) => s + w.ml, 0), [date]);
}
