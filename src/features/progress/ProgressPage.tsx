import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Columns2, Plus, Ruler, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { NumberField, TextField } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { LazyTrendChart } from '@/components/LazyTrendChart';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { BodyMeasurement, ProgressPhoto } from '@/db/types';
import { fmt, num, signed, t } from '@/i18n';
import { formatDateFr, isValidISODate, todayISO } from '@/lib/dates';
import { dailyAverages } from '@/lib/stats';
import { compressImage } from './photos';

const p = t.progress;
type Metric = 'weightKg' | 'waistCm' | 'chestCm' | 'armCm' | 'thighCm' | 'hipCm' | 'neckCm';
const METRICS: Metric[] = ['weightKg', 'waistCm', 'chestCm', 'armCm', 'thighCm', 'hipCm', 'neckCm'];
const LIMITS: Record<Metric, [number, number]> = { weightKg: [30, 300], waistCm: [40, 200], chestCm: [50, 200], armCm: [15, 70], thighCm: [25, 100], hipCm: [50, 200], neckCm: [20, 70] };
const unit = (m: Metric) => (m === 'weightKg' ? 'kg' : 'cm');

export function ProgressPage() {
  const measures = useLiveQuery(() => db.bodyMeasurements.orderBy('date').toArray());
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState<Metric>('waistCm');
  if (!measures) return null;
  return (
    <>
      <PageHeader title={p.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Button size="lg" block onClick={() => setAdding(true)} icon={<Ruler size={18} />}>
          {p.add}
        </Button>
        <MetricCard measures={measures} metric={metric} setMetric={setMetric} />
        <PhotosCard />
        <HistoryCard measures={measures} />
      </main>
      {adding && <MeasureSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function MetricCard({ measures, metric, setMetric }: { measures: BodyMeasurement[]; metric: Metric; setMetric: (m: Metric) => void }) {
  const series = useMemo(() => dailyAverages(measures.filter((m) => m[metric] !== undefined).map((m) => ({ date: m.date, value: m[metric]! }))), [measures, metric]);
  const last = series.at(-1);
  const first = series[0];
  return (
    <Card>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {METRICS.map((m) => (
          <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)} className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium ${metric === m ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted'}`}>
            {p.metrics[m]}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="text-xs text-muted">{p.latest}</p>
          <p className="num text-xl font-semibold">{last ? `${num(last.value)} ${unit(metric)}` : '—'}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="text-xs text-muted">{p.sinceStart}</p>
          <p className="num text-xl font-semibold">{series.length >= 2 ? `${signed(last!.value - first.value)} ${unit(metric)}` : '—'}</p>
        </div>
      </div>
      {series.length >= 2 ? (
        <LazyTrendChart labels={series.map((s) => formatDateFr(s.date))} values={series.map((s) => Math.round(s.value * 10) / 10)} format={(v) => `${num(v)} ${unit(metric)}`} ariaLabel={p.metrics[metric]} />
      ) : (
        <p className="text-sm text-muted">{fmt(p.chartEmpty, { metric: p.metrics[metric].toLowerCase() })}</p>
      )}
    </Card>
  );
}

function MeasureSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Partial<Record<Metric, number>>>({});
  const [error, setError] = useState<string>();

  async function save() {
    const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [Metric, number][];
    if (!entries.length) return setError(p.needOne);
    for (const [m, v] of entries) if (v < LIMITS[m][0] || v > LIMITS[m][1]) return setError(fmt(p.invalid, { metric: p.metrics[m].toLowerCase() }));
    if (!isValidISODate(date) || date > todayISO()) return setError(t.errors.date);
    await db.bodyMeasurements.add({ date, ...Object.fromEntries(entries), createdAt: Date.now() });
    toast(p.saved);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={p.add}>
      <div className="flex flex-col gap-4">
        <TextField label={p.date} type="date" value={date} max={todayISO()} onChange={setDate} />
        <div className="grid grid-cols-2 gap-3">
          {METRICS.map((m) => (
            <NumberField key={m} label={p.metrics[m]} unit={unit(m)} value={values[m]} onChange={(v) => { setValues((x) => ({ ...x, [m]: v })); setError(undefined); }} />
          ))}
        </div>
        <p className="text-xs text-muted">{p.howTo}</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button size="lg" block onClick={save}>
          {t.common.save}
        </Button>
      </div>
    </Sheet>
  );
}

function HistoryCard({ measures }: { measures: BodyMeasurement[] }) {
  const list = [...measures].reverse().slice(0, 30);
  return (
    <Card>
      <CardTitle>{p.history}</CardTitle>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{p.noHistory}</p>
      ) : (
        <ul className="-mx-4 -mb-4 divide-y divide-line">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2 pl-4">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{formatDateFr(m.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="num block truncate text-xs text-muted">
                  {METRICS.filter((k) => m[k] !== undefined)
                    .map((k) => `${p.metrics[k]} ${num(m[k]!)}`)
                    .join(' · ')}
                </span>
              </span>
              <button type="button" aria-label={p.deleteMeasure} onClick={() => db.bodyMeasurements.delete(m.id!)} className="grid size-11 place-items-center text-muted active:text-danger">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** URL d'objet pour une photo, libérée automatiquement. */
function useObjectUrl(photo?: ProgressPhoto) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(new Blob([photo.bytes], { type: photo.type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return url;
}

function Thumb({ photo, onClick }: { photo: ProgressPhoto; onClick: () => void }) {
  const url = useObjectUrl(photo);
  return (
    <button type="button" onClick={onClick} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2">
      {url && <img src={url} alt={`${p.poses[photo.pose]} ${formatDateFr(photo.date)}`} className="size-full object-cover" />}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] text-white">
        {p.poses[photo.pose]} · {formatDateFr(photo.date)}
      </span>
    </button>
  );
}

function PhotosCard() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const photos = useLiveQuery(() => db.progressPhotos.orderBy('date').reverse().toArray()) ?? [];
  const [pose, setPose] = useState<ProgressPhoto['pose']>('front');
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [comparing, setComparing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canCompare = (['front', 'side', 'back'] as const).some((k) => photos.filter((x) => x.pose === k).length >= 2);

  async function onFile(file?: File) {
    if (input.current) input.current.value = '';
    if (!file) return;
    try {
      const blob = await compressImage(file);
      await db.progressPhotos.add({ date: todayISO(), pose, bytes: await blob.arrayBuffer(), type: blob.type || 'image/jpeg' });
      toast(p.photoSaved);
    } catch {
      toast(p.photoError, 'error');
    }
  }

  return (
    <Card>
      <CardTitle icon={<Camera size={18} />}>{p.photos}</CardTitle>
      <p className="mb-3 text-xs text-muted">{p.photosPrivacy}</p>
      <Segmented label={p.pose} value={pose} onChange={setPose} options={(['front', 'side', 'back'] as const).map((v) => ({ value: v, label: p.poses[v] }))} />
      <input ref={input} type="file" accept="image/*" className="hidden" data-testid="photo-file" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()} icon={<Plus size={18} />}>
          {p.addPhoto}
        </Button>
        <Button variant="secondary" onClick={() => setComparing(true)} disabled={!canCompare} icon={<Columns2 size={18} />}>
          {p.compare}
        </Button>
      </div>
      {photos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{p.noPhotos}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((ph) => (
            <Thumb key={ph.id} photo={ph} onClick={() => setViewing(ph)} />
          ))}
        </div>
      )}
      {viewing && (
        <Sheet open onClose={() => setViewing(null)} title={`${p.poses[viewing.pose]} · ${formatDateFr(viewing.date, { day: 'numeric', month: 'long', year: 'numeric' })}`}>
          <FullPhoto photo={viewing} />
          <Button className="mt-4" variant="danger" block onClick={() => setDeleting(true)} icon={<Trash2 size={18} />}>
            {p.deletePhoto}
          </Button>
        </Sheet>
      )}
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={p.deletePhoto}
        danger
        confirmLabel={t.common.delete}
        onConfirm={async () => {
          if (viewing) await db.progressPhotos.delete(viewing.id!);
          setViewing(null);
        }}
      >
        {p.deletePhotoConfirm}
      </ConfirmSheet>
      {comparing && <CompareSheet photos={photos} onClose={() => setComparing(false)} />}
    </Card>
  );
}

function FullPhoto({ photo }: { photo: ProgressPhoto }) {
  const url = useObjectUrl(photo);
  return url ? <img src={url} alt="" className="max-h-[60dvh] w-full rounded-2xl object-contain" /> : null;
}

/** Comparaison avant / après : l'image « après » est révélée par un curseur. */
function CompareSheet({ photos, onClose }: { photos: ProgressPhoto[]; onClose: () => void }) {
  const poses = (['front', 'side', 'back'] as const).filter((k) => photos.filter((x) => x.pose === k).length >= 2);
  const [pose, setPose] = useState(poses[0]);
  const list = photos.filter((x) => x.pose === pose).sort((a, b) => (a.date < b.date ? -1 : 1));
  const [beforeId, setBeforeId] = useState(list[0]?.id);
  const [afterId, setAfterId] = useState(list.at(-1)?.id);
  const [pos, setPos] = useState(50);
  useEffect(() => {
    setBeforeId(list[0]?.id);
    setAfterId(list.at(-1)?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);
  const before = useObjectUrl(list.find((x) => x.id === beforeId));
  const after = useObjectUrl(list.find((x) => x.id === afterId));
  const select = (label: string, value: number | undefined, set: (v: number) => void) => (
    <label className="flex flex-col gap-1 text-sm text-muted">
      {label}
      <select value={value} onChange={(e) => set(Number(e.target.value))} className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg">
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {formatDateFr(x.date, { day: 'numeric', month: 'short', year: 'numeric' })}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Sheet open onClose={onClose} title={p.compare}>
      {!poses.length ? (
        <Notice>{p.compareNeedTwo}</Notice>
      ) : (
        <div className="flex flex-col gap-3">
          {poses.length > 1 && <Segmented value={pose} onChange={setPose} options={poses.map((v) => ({ value: v, label: p.poses[v] }))} />}
          <div className="grid grid-cols-2 gap-2">
            {select(p.before, beforeId, setBeforeId)}
            {select(p.after, afterId, setAfterId)}
          </div>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface-2 select-none">
            {before && <img src={before} alt={p.before} className="absolute inset-0 size-full object-cover" />}
            {after && <img src={after} alt={p.after} className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
            <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">{p.before}</span>
            <span className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">{p.after}</span>
          </div>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={p.slider} className="w-full accent-[var(--accent-text)]" />
        </div>
      )}
    </Sheet>
  );
}
