import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { NumberField, TextField } from '@/components/Field';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { BodyMeasurement } from '@/db/types';
import { num, t } from '@/i18n';
import { formatDateFr, todayISO } from '@/lib/dates';
import { fieldErrors, weightEntrySchema } from '@/lib/schemas';

const w = t.weightSheet;

export function WeightSheet({ open, onClose, entries, lastWeight }: { open: boolean; onClose: () => void; entries: BodyMeasurement[]; lastWeight: number }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState<number | undefined>(lastWeight);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const res = weightEntrySchema.safeParse({ date, weightKg: weight });
    if (!res.success) {
      setErrors(fieldErrors(res.error));
      return;
    }
    await db.bodyMeasurements.add({ ...res.data, createdAt: Date.now() });
    toast(t.common.saved);
    setErrors({});
    onClose();
  }

  // Supprimer une pesée ne supprime que le poids : les autres mesures du même enregistrement restent.
  async function remove(e: BodyMeasurement) {
    const { id, weightKg: _w, date: _d, createdAt: _c, ...others } = e;
    const hasOthers = Object.values(others).some((v) => v !== undefined);
    if (hasOthers) await db.bodyMeasurements.update(id!, { weightKg: undefined });
    else await db.bodyMeasurements.delete(id!);
  }

  const recent = [...entries].reverse().slice(0, 8);

  return (
    <Sheet open={open} onClose={onClose} title={w.title}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={w.weight} value={weight} onChange={setWeight} unit={t.common.kg} error={errors.weightKg} autoFocus />
          <TextField label={w.date} type="date" value={date} max={todayISO()} onChange={setDate} error={errors.date} />
        </div>
        <p className="text-xs text-muted">{w.tip}</p>
        <Button size="lg" block onClick={save}>
          {t.common.save}
        </Button>
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">{w.history}</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">{w.empty}</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl bg-surface-2">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between pl-4">
                  <span className="text-sm text-muted">{formatDateFr(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="flex items-center">
                    <span className="num font-medium">{num(e.weightKg!, 1)} kg</span>
                    <button
                      type="button"
                      onClick={() => remove(e)}
                      aria-label={`${t.common.delete} ${formatDateFr(e.date)}`}
                      className="grid size-11 place-items-center text-muted active:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
