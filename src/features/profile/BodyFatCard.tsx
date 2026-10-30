import { useState } from 'react';
import { Percent } from 'lucide-react';
import { Card, CardTitle } from '@/components/Card';
import { NumberField } from '@/components/Field';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Profile } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { bodyFatNavy } from '@/lib/energy';
import { todayISO } from '@/lib/dates';

const bf = t.bodyFat;

export function BodyFatCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [neck, setNeck] = useState<number>();
  const [waist, setWaist] = useState<number>();
  const [hip, setHip] = useState<number>();
  const female = profile.gender === 'female';
  const ready = neck !== undefined && waist !== undefined && (!female || hip !== undefined);
  const result = ready ? bodyFatNavy({ gender: profile.gender, heightCm: profile.heightCm, neckCm: neck, waistCm: waist, hipCm: hip }) : null;

  async function save() {
    await db.bodyMeasurements.add({ date: todayISO(), neckCm: neck, waistCm: waist, hipCm: hip, createdAt: Date.now() });
    toast(t.common.saved);
  }

  return (
    <Card>
      <CardTitle icon={<Percent size={18} />}>{bf.title}</CardTitle>
      <p className="mb-4 text-sm text-muted">{fmt(bf.text, { hip: female ? bf.hipSuffix : '' })}</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={bf.neck} value={neck} onChange={setNeck} unit={t.common.cm} />
        <NumberField label={bf.waist} value={waist} onChange={setWaist} unit={t.common.cm} />
        {female && <NumberField label={bf.hip} value={hip} onChange={setHip} unit={t.common.cm} />}
      </div>
      {ready && (
        <div className="mt-4 flex flex-col gap-3">
          <p className={`rounded-2xl px-4 py-3 text-center font-semibold ${result === null ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent-text'}`}>
            {result === null ? bf.invalid : fmt(bf.result, { pct: num(result) })}
          </p>
          {result !== null && (
            <Button variant="secondary" onClick={save} block>
              {bf.saveMeasures}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
