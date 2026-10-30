import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { NumberField, TextArea, TextField } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useProfile, useWeightEntries, latestWeight } from '@/hooks/useData';
import { num, t } from '@/i18n';
import { todayISO } from '@/lib/dates';
import { fieldErrors } from '@/lib/schemas';
import { formatPace, parseDuration, paceSecPerKm, runCaloriesEstimate, speedKmh } from '@/lib/running';
import { RUN_TYPES, type RunTypeKey } from '@/lib/runTypes';
import { runEntrySchema, saveRun } from './service';

const r = t.run;

export function RunEntrySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const profile = useProfile();
  const weights = useWeightEntries();
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<RunTypeKey>('easy');
  const [distance, setDistance] = useState<number>();
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const durationSec = parseDuration(duration);
  const preview = distance && durationSec ? { pace: paceSecPerKm(distance, durationSec), speed: speedKmh(distance, durationSec) } : null;
  const weight = profile ? latestWeight(profile, weights) : undefined;

  async function save() {
    const res = runEntrySchema.safeParse({ date, type, distanceKm: distance, durationSec, notes: notes.trim() || undefined });
    if (!res.success) {
      setErrors(fieldErrors(res.error));
      return;
    }
    await saveRun({ ...res.data, source: 'manual' });
    toast(r.saved);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={r.add}>
      <div className="flex flex-col gap-4">
        <Segmented layout="grid" label={r.type} value={type} onChange={setType} options={RUN_TYPES.map((v) => ({ value: v, label: r.types[v] }))} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={r.distance} unit="km" value={distance} onChange={(v) => { setDistance(v); setErrors({}); }} error={errors.distanceKm} />
          <TextField label={r.durationLabel} value={duration} inputMode="numeric" placeholder="32:10" onChange={(v) => { setDuration(v); setErrors({}); }} error={errors.durationSec} hint={r.durationHint} />
        </div>
        <TextField label={r.date} type="date" value={date} max={todayISO()} onChange={setDate} error={errors.date} />
        {preview && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2 p-2.5">
              <p className="text-xs text-muted">{r.pace}</p>
              <p className="num font-semibold">{formatPace(preview.pace)}{r.perKm}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 p-2.5">
              <p className="text-xs text-muted">{r.speed}</p>
              <p className="num font-semibold">{num(preview.speed)} {r.kmh}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 p-2.5">
              <p className="text-xs text-muted">{r.calories}*</p>
              <p className="num font-semibold">{weight ? `${runCaloriesEstimate(weight, distance!)} kcal` : '—'}</p>
            </div>
          </div>
        )}
        {preview && <p className="-mt-2 text-xs text-muted">* {r.caloriesEstimate}</p>}
        <TextArea label={r.notes} value={notes} onChange={setNotes} placeholder={r.notesPlaceholder} />
        <Button size="lg" block onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Sheet>
  );
}
