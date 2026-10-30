import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Footprints, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { NumberField, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Toggle } from '@/components/Toggle';
import { useToast } from '@/components/Toast';
import { db, updateSettings } from '@/db/db';
import type { Shoe } from '@/db/types';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { SHOE_DEFAULT_ALERT_KM, shoeKm, shoeStatus } from '@/lib/runGoals';

const x = t.runx;

export function ShoesPage() {
  const data = useLiveQuery(async () => ({ shoes: await db.shoes.toArray(), runs: await db.runs.toArray() }));
  const settings = useSettings();
  const [editing, setEditing] = useState<Shoe | 'new' | null>(null);
  if (!data || !settings) return null;
  const active = data.shoes.filter((s) => !s.retired);
  const retired = data.shoes.filter((s) => s.retired);

  const row = (s: Shoe) => {
    const km = shoeKm(s, data.runs);
    const status = shoeStatus(km, s.alertKm);
    const pct = Math.min(100, (km / s.alertKm) * 100);
    const n = data.runs.filter((r) => r.shoeId === s.id).length;
    return (
      <li key={s.id}>
        <button type="button" onClick={() => setEditing(s)} className="w-full rounded-2xl bg-surface-2 p-3.5 text-left active:bg-line" data-testid="shoe-row">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              {s.name}
              {settings.defaultShoeId === s.id && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-text">{x.shoeDefaultTag}</span>}
            </span>
            <span className="num text-sm">{fmt(x.shoeKm, { km: num(km, 0), alert: s.alertKm })}</span>
          </span>
          <span className="mt-2 block h-2.5 overflow-hidden rounded-full bg-line">
            <span className={`block h-full rounded-full ${status === 'ok' ? 'bg-accent' : status === 'soon' ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="mt-1.5 flex justify-between text-xs">
            <span className={status === 'ok' ? 'text-muted' : status === 'soon' ? 'text-warning' : 'text-danger'}>{x.shoeStatus[status]}</span>
            <span className="text-muted">{fmt(x.shoeRuns, { n })}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
      <PageHeader title={x.shoesTitle} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <p className="text-sm text-muted">{x.shoesIntro}</p>
        <Button size="lg" block onClick={() => setEditing('new')} icon={<Plus size={18} />}>
          {x.addShoe}
        </Button>
        {data.shoes.length === 0 ? (
          <Notice icon={<Footprints size={16} />}>{x.noShoes}</Notice>
        ) : (
          <>
            {active.length > 0 && <ul className="flex flex-col gap-2">{active.map(row)}</ul>}
            {retired.length > 0 && (
              <Card>
                <CardTitle>{x.shoeRetired}</CardTitle>
                <ul className="flex flex-col gap-2">{retired.map(row)}</ul>
              </Card>
            )}
          </>
        )}
      </main>
      {editing && <ShoeSheet shoe={editing === 'new' ? null : editing} isDefault={editing !== 'new' && settings.defaultShoeId === editing.id} onClose={() => setEditing(null)} />}
    </>
  );
}

function ShoeSheet({ shoe, isDefault, onClose }: { shoe: Shoe | null; isDefault: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(shoe?.name ?? '');
  const [startKm, setStartKm] = useState<number | undefined>(shoe?.startKm ?? 0);
  const [alertKm, setAlertKm] = useState<number | undefined>(shoe?.alertKm ?? SHOE_DEFAULT_ALERT_KM);
  const [def, setDef] = useState(shoe ? isDefault : true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  async function save(patch: Partial<Shoe> = {}) {
    if (!name.trim() || startKm === undefined || startKm < 0 || startKm > 5000 || !alertKm || alertKm < 100 || alertKm > 3000) {
      setError(x.errShoe);
      return;
    }
    const row: Shoe = { ...(shoe ?? { retired: false, createdAt: Date.now() }), name: name.trim(), startKm, alertKm, ...patch };
    const id = (await db.shoes.put(row)) as number;
    const settings = await db.settings.get('app');
    if (def && !row.retired) await updateSettings({ defaultShoeId: id });
    else if (settings?.defaultShoeId === id) await updateSettings({ defaultShoeId: undefined });
    toast(x.shoeSaved);
    onClose();
  }

  return (
    <>
      <Sheet open onClose={onClose} title={shoe ? x.editShoe : x.addShoe}>
        <div className="flex flex-col gap-4">
          <TextField label={x.shoeName} value={name} placeholder={x.shoeNamePlaceholder} onChange={(v) => { setName(v); setError(undefined); }} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={x.shoeStartKm} unit="km" value={startKm} onChange={setStartKm} />
            <NumberField label={x.shoeAlertKm} unit="km" value={alertKm} onChange={setAlertKm} integer />
          </div>
          <Toggle label={x.shoeDefault} checked={def} onChange={setDef} disabled={shoe?.retired} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button size="lg" block onClick={() => save()}>
            {t.common.save}
          </Button>
          {shoe && (
            <>
              <Button size="lg" variant="secondary" block onClick={() => save({ retired: !shoe.retired })}>
                {shoe.retired ? x.shoeUnretire : x.shoeRetire}
              </Button>
              <Button size="lg" variant="danger" block onClick={() => setDeleting(true)}>
                {x.shoeDelete}
              </Button>
            </>
          )}
        </div>
      </Sheet>
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={x.shoeDelete}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          await db.transaction('rw', db.shoes, db.runs, async () => {
            await db.runs.where('shoeId').equals(shoe!.id!).modify({ shoeId: undefined });
            await db.shoes.delete(shoe!.id!);
          });
          if (isDefault) await updateSettings({ defaultShoeId: undefined });
          onClose();
        }}
      >
        {x.shoeDeleteConfirm}
      </ConfirmSheet>
    </>
  );
}
