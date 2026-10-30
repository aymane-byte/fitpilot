import { useLiveQuery } from 'dexie-react-hooks';
import { Droplet, Undo2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { db } from '@/db/db';
import { num, t } from '@/i18n';
import type { ISODate } from '@/lib/dates';

/** Suivi de l'eau d'une journée : +250 / +500 ml et annulation du dernier ajout. */
export function WaterTracker({ date, targetMl }: { date: ISODate; targetMl: number }) {
  const logs = useLiveQuery(() => db.waterLogs.where('date').equals(date).sortBy('at'), [date]) ?? [];
  const total = logs.reduce((s, w) => s + w.ml, 0);
  const last = logs.at(-1);
  const add = (ml: number) => db.waterLogs.add({ date, ml, at: Date.now() });
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
        <Button variant="secondary" className="flex-1" onClick={() => add(250)}>
          +250 ml
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => add(500)}>
          +500 ml
        </Button>
        <Button variant="secondary" onClick={() => last && db.waterLogs.delete(last.id!)} disabled={!last} aria-label={t.dashboard.waterUndo}>
          <Undo2 size={18} />
        </Button>
      </div>
    </div>
  );
}

/** Total d'eau d'une journée (pour les résumés). */
export function useWaterTotal(date: ISODate) {
  return useLiveQuery(async () => (await db.waterLogs.where('date').equals(date).toArray()).reduce((s, w) => s + w.ml, 0), [date]);
}
