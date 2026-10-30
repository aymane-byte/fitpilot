import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Plus, Star, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import { MiniNumber, NumberField, TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import type { Food, MealType } from '@/db/types';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { formatDateFr, todayISO, type ISODate } from '@/lib/dates';
import type { CiqualFood } from '@/lib/ciqual';
import { rescaleItem, type VisionItem } from '@/lib/foodVision';
import { FoodEditor, FoodRow, FoodSearchBar, PortionPicker, useFoodSearch } from './FoodSheets';
import { BarcodeScanner } from './BarcodeScanner';
import { addFood, addFrequentMeal, addPlanItem, addQuickItem, favoriteFoods, loadFrequentMeals, recentFoods } from './service';
import { analyzeMealPhoto, lookupBarcode, materializeCiqual, searchCiqualFoods, VisionError } from './sources';
import { mealLabel } from './labels';

const n = t.nutrition;
const x = t.nx;
type Mode = 'search' | 'favorites' | 'frequent' | 'scan' | 'quick' | 'photo';

/**
 * Ajout d'un aliment au journal (ou au planificateur avec `target="plan"`) :
 * recherche (aliments + CIQUAL), favoris, repas fréquents, code-barres, ajout rapide, photo IA.
 */
export function AddFoodSheet({ date, meal, onClose, target = 'journal' }: { date: ISODate; meal: MealType; onClose: () => void; target?: 'journal' | 'plan' }) {
  const toast = useToast();
  const settings = useSettings();
  const [mode, setMode] = useState<Mode>('search');
  const [food, setFood] = useState<Food | null>(null);
  const [notice, setNotice] = useState<string>();
  const [creating, setCreating] = useState(false);
  const hasKey = !!(settings?.geminiApiKey || settings?.proxyUrl);
  const journal = target === 'journal';
  const modes: Mode[] = ['search', 'favorites', ...(journal ? (['frequent'] as Mode[]) : []), 'scan', ...(journal ? (['quick'] as Mode[]) : []), ...(journal && hasKey ? (['photo'] as Mode[]) : [])];
  const mealName = mealLabel(meal, settings).toLowerCase();
  const title = creating ? n.newFood : food ? food.name : target === 'plan' ? `${x.planAdd} · ${mealName}` : fmt(n.addTo, { meal: mealName });

  async function add(f: Food, grams: number, unit?: { label: string; qty: number }) {
    if (journal) await addFood(date, meal, f, grams, unit);
    else await addPlanItem(date, meal, f, grams, unit);
    toast(n.added);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      {creating ? (
        <FoodEditor
          onSaved={(f) => {
            setCreating(false);
            setFood(f);
          }}
        />
      ) : food ? (
        <div className="flex flex-col gap-3">
          {notice && <Notice>{notice}</Notice>}
          <PortionPicker food={food} onBack={() => { setFood(null); setNotice(undefined); }} onAdd={(g, u) => add(food, g, u)} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label={n.addFood} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium ${mode === m ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted'}`}
              >
                {x.modes[m]}
              </button>
            ))}
          </div>
          {mode === 'search' && <SearchMode onPick={setFood} onCreate={() => setCreating(true)} />}
          {mode === 'favorites' && <FavoritesMode onPick={setFood} />}
          {mode === 'frequent' && (
            <FrequentMode
              onAdd={async (m) => {
                await addFrequentMeal(date, meal, m);
                toast(x.mealAdded);
                onClose();
              }}
            />
          )}
          {mode === 'scan' && (
            <ScanMode
              onFound={(f, msg) => {
                setNotice(msg);
                setFood(f);
              }}
            />
          )}
          {mode === 'quick' && (
            <QuickMode
              onAdd={async (v) => {
                await addQuickItem(date, meal, v);
                toast(n.added);
                onClose();
              }}
            />
          )}
          {mode === 'photo' && (
            <PhotoMode
              onAdd={async (items) => {
                for (const it of items) await addQuickItem(date, meal, { ...it, name: `${it.name} ${x.photoItemSuffix}`, estimated: true });
                toast(x.mealAdded);
                onClose();
              }}
            />
          )}
        </div>
      )}
    </Sheet>
  );
}

function SearchMode({ onPick, onCreate }: { onPick: (f: Food) => void; onCreate: () => void }) {
  const search = useFoodSearch();
  const recent = useLiveQuery(() => recentFoods()) ?? [];
  const [ciqual, setCiqual] = useState<CiqualFood[] | null>(null);
  const [ciqualState, setCiqualState] = useState<'idle' | 'loading' | 'error'>('idle');
  const q = search.query.trim();

  // Recherche CIQUAL après une courte pause de frappe.
  useEffect(() => {
    if (q.length < 2) {
      setCiqual(null);
      return;
    }
    let cancelled = false;
    setCiqualState('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await searchCiqualFoods(q);
        if (!cancelled) {
          setCiqual(res);
          setCiqualState('idle');
        }
      } catch {
        if (!cancelled) setCiqualState('error');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  // Les aliments CIQUAL déjà copiés localement apparaissent dans « Mes aliments » : pas de doublon.
  const localCodes = new Set(search.filtered.map((f) => f.ciqualCode).filter(Boolean));
  const ciqualList = (ciqual ?? []).filter((c) => !localCodes.has(c.code) && search.cat === 'all');

  return (
    <>
      <FoodSearchBar {...search} />
      {!q && search.cat === 'all' && recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-muted">{n.recent}</p>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((f) => (
              <button key={f.id} type="button" onClick={() => onPick(f)} className="min-h-9 rounded-full border border-line bg-surface-2 px-3 text-sm active:bg-line">
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="max-h-[48dvh] overflow-y-auto rounded-2xl border border-line">
        {q && <p className="bg-surface-2 px-4 py-1.5 text-xs font-semibold text-muted">{x.localResults}</p>}
        {search.filtered.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">{n.noFood}</p>
        ) : (
          <ul className="divide-y divide-line">
            {search.filtered.slice(0, q ? 40 : 200).map((f) => (
              <FoodRow key={f.id} f={f} onClick={() => onPick(f)} />
            ))}
          </ul>
        )}
        {q.length >= 2 && search.cat === 'all' && (
          <>
            <p className="bg-surface-2 px-4 py-1.5 text-xs font-semibold text-muted">{x.ciqualResults}</p>
            {ciqualState === 'loading' && <p className="px-4 py-3 text-sm text-muted">{x.ciqualLoading}</p>}
            {ciqualState === 'error' && <p className="px-4 py-3 text-sm text-warning">{x.ciqualOffline}</p>}
            {ciqualState === 'idle' && ciqualList.length === 0 && <p className="px-4 py-3 text-sm text-muted">{n.noFood}</p>}
            <ul className="divide-y divide-line" data-testid="ciqual-results">
              {ciqualList.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={async () => onPick(await materializeCiqual(c))} className="flex min-h-14 w-full flex-col justify-center px-4 py-2 text-left active:bg-surface-2">
                    <span className="block text-[15px] font-medium">{c.name}</span>
                    <span className="num block text-xs text-muted">
                      {c.kcal} kcal · P {num(c.proteinG)} · G {num(c.carbsG)} · L {num(c.fatG)} {n.per100}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {q.length < 2 && <p className="text-xs text-muted">{x.ciqualHint}</p>}
      <Button variant="secondary" block onClick={onCreate} icon={<Plus size={18} />}>
        {n.newFood}
      </Button>
    </>
  );
}

function FavoritesMode({ onPick }: { onPick: (f: Food) => void }) {
  const favs = useLiveQuery(() => favoriteFoods());
  if (!favs) return null;
  if (!favs.length) return <Notice icon={<Star size={16} />}>{x.noFavorites}</Notice>;
  return (
    <ul className="max-h-[55dvh] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
      {favs.map((f) => (
        <FoodRow key={f.id} f={f} onClick={() => onPick(f)} />
      ))}
    </ul>
  );
}

function FrequentMode({ onAdd }: { onAdd: (m: Awaited<ReturnType<typeof loadFrequentMeals>>[number]) => void }) {
  const list = useLiveQuery(() => loadFrequentMeals(todayISO()));
  if (!list) return null;
  if (!list.length) return <Notice>{x.noFrequent}</Notice>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((m, i) => (
        <li key={i} className="rounded-2xl bg-surface-2 p-3">
          <p className="text-[15px] font-medium">{m.items.map((it) => it.name).join(' + ')}</p>
          <p className="num text-xs text-muted">{fmt(x.frequentTimes, { n: m.count, date: formatDateFr(m.lastDate) })}</p>
          <Button className="mt-2" size="sm" onClick={() => onAdd(m)} icon={<Plus size={16} />}>
            {x.addMeal}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ScanMode({ onFound }: { onFound: (f: Food, notice: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  async function onCode(code: string) {
    setBusy(true);
    setMsg(undefined);
    const res = await lookupBarcode(code);
    setBusy(false);
    if (res.status === 'found') onFound(res.food, `${res.cached ? x.barcodeCached : x.barcodeFound}${res.food.nutriscore ? ` ${fmt(x.nutriscore, { g: res.food.nutriscore })}.` : ''} ${x.offNote}`);
    else setMsg(res.status === 'invalid' ? x.barcodeInvalid : res.status === 'notFound' ? x.barcodeNotFound : x.barcodeOffline);
  }
  return (
    <>
      <BarcodeScanner onCode={onCode} busy={busy} />
      {msg && <Notice tone="warning">{msg}</Notice>}
    </>
  );
}

function QuickMode({ onAdd }: { onAdd: (v: { name: string; kcal: number; proteinG?: number; carbsG?: number; fatG?: number; estimated: boolean }) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number>();
  const [p, setP] = useState<number>();
  const [c, setC] = useState<number>();
  const [f, setF] = useState<number>();
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{x.quickHint}</p>
      <TextField label={x.quickName} value={name} onChange={setName} placeholder={x.quickNamePlaceholder} />
      <NumberField label={x.quickKcal} unit="kcal" value={kcal} onChange={(v) => { setKcal(v); setError(false); }} integer error={error ? x.errQuick : undefined} />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label={t.targets.protein} unit="g" value={p} onChange={setP} />
        <NumberField label={t.targets.carbs} unit="g" value={c} onChange={setC} />
        <NumberField label={t.targets.fat} unit="g" value={f} onChange={setF} />
      </div>
      <Button
        size="lg"
        block
        onClick={() => {
          if (!kcal || kcal < 1 || kcal > 5000) return setError(true);
          onAdd({ name: name.trim() || x.quickDefault, kcal, proteinG: p, carbsG: c, fatG: f, estimated: true });
        }}
      >
        {t.common.add}
      </Button>
    </div>
  );
}

function PhotoMode({ onAdd }: { onAdd: (items: VisionItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [items, setItems] = useState<VisionItem[] | null>(null);
  // Valeurs d'origine de l'IA : une correction de quantité repart toujours d'elles (pas de dérive d'arrondi).
  const [origin, setOrigin] = useState<VisionItem[]>([]);
  const [preview, setPreview] = useState<string>();
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setItems(null);
    try {
      const { compressImage } = await import('../progress/photos');
      const small = await compressImage(file, 1024, 0.8);
      setPreview(URL.createObjectURL(small));
      const res = await analyzeMealPhoto(small);
      setOrigin(res);
      setItems(res);
    } catch (e) {
      setError(x.photoErr[e instanceof VisionError ? e.code : 'network']);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const total = (items ?? []).reduce((s, i) => s + i.kcal, 0);
  return (
    <div className="flex flex-col gap-3">
      <Notice>{x.photoPrivacy}</Notice>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={x.photoTake} onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="secondary" block disabled={busy} onClick={() => input.current?.click()} icon={<Camera size={18} />}>
        {busy ? x.photoAnalyzing : x.photoTake}
      </Button>
      {preview && <img src={preview} alt={x.photoTitle} className="max-h-48 w-full rounded-2xl object-cover" />}
      {error && <Notice tone="warning">{error}</Notice>}
      {items && (
        <>
          <p className="text-sm font-medium text-warning">{x.photoReview}</p>
          <ul className="flex flex-col gap-2" data-testid="vision-items">
            {items.map((it, k) => (
              <li key={k} className="rounded-2xl bg-surface-2 p-3">
                <div className="flex items-start gap-2">
                  <input
                    aria-label={x.quickName}
                    value={it.name}
                    onChange={(e) => setItems(items.map((v, j) => (j === k ? { ...v, name: e.target.value } : v)))}
                    className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-accent-text"
                  />
                  <button
                    type="button"
                    aria-label={`${x.remove} ${it.name}`}
                    onClick={() => {
                      setItems(items.filter((_, j) => j !== k));
                      setOrigin(origin.filter((_, j) => j !== k));
                    }} className="grid size-11 place-items-center rounded-xl text-muted active:text-danger">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-[5rem_1fr] items-center gap-2">
                  <MiniNumber label={`${it.name} (g)`} value={it.grams} integer onCommit={(g) => g && g > 0 && setItems(items.map((v, j) => (j === k ? { ...rescaleItem(origin[k], g), name: v.name } : v)))} />
                  <p className="num text-xs text-muted">
                    g · {it.kcal} kcal · P {num(it.proteinG)} · G {num(it.carbsG)} · L {num(it.fatG)} <span className="text-warning">({x.estimatedTag})</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="num text-sm">≈ {total} kcal</p>
          <Button size="lg" block disabled={!items.length} onClick={() => onAdd(items.filter((i) => i.name.trim()))}>
            {fmt(x.photoAdd, { n: items.length })}
          </Button>
        </>
      )}
    </div>
  );
}
