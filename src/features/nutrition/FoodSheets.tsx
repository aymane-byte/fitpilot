import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Plus, Search, Star, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/Button';
import { NumberField, TextField } from '@/components/Field';
import { Notice } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Food } from '@/db/types';
import { useProfile } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { allergenMatches, macroKcalGap, nutrientsFor } from '@/lib/nutrition';
import { searchFoods } from '@/lib/search';
import { MICRO_KEYS, MICRO_UNITS, type MicroKey } from '@/lib/micros';
import { Toggle } from '@/components/Toggle';

const n = t.nutrition;
export const FOOD_CATEGORIES = ['protein', 'starch', 'bread', 'dairy', 'fruit', 'veg', 'fat', 'nuts', 'dish', 'drink', 'sweet', 'packaged'] as const;

export function useFoodSearch() {
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray()) ?? [];
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const filtered = useMemo(() => {
    const inCat = foods.filter((f) => cat === 'all' || (cat === 'custom' ? f.custom : f.category === cat));
    if (!query.trim()) return inCat;
    // Recherche par mots, ordre libre : « thé sans sucre » trouve « Thé à la menthe sans sucre ».
    return searchFoods(inCat, query, (f) => `${f.name} ${f.brand ?? ''}`).map((h) => h.item);
  }, [foods, query, cat]);
  return { filtered, query, setQuery, cat, setCat };
}

export function FoodSearchBar({ query, setQuery, cat, setCat }: Pick<ReturnType<typeof useFoodSearch>, 'query' | 'setQuery' | 'cat' | 'setCat'>) {
  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">{n.search}</span>
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={n.search}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 pr-4 pl-11 text-fg outline-none placeholder:text-muted/70 focus:border-accent-text"
        />
      </label>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {['all', ...FOOD_CATEGORIES, 'custom'].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${cat === c ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted'}`}
          >
            {c === 'all' ? n.all : n.categories[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FoodRow({ f, onClick }: { f: Food; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {f.favorite && <Star size={13} className="mr-1 inline -translate-y-px fill-current text-warning" aria-label={t.nx.favorite} />}
            {f.name}
            {f.estimated && <span className="ml-2 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">{n.estimatedBadge}</span>}
            {f.custom && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-text">{n.customBadge}</span>}
          </span>
          <span className="num block text-xs text-muted">
            {f.kcal} kcal · P {num(f.proteinG)} · G {num(f.carbsG)} · L {num(f.fatG)} {n.per100}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

export function PortionPicker({ food, onAdd, onBack, cta = t.common.add }: { food: Food; onAdd: (grams: number, unit?: { label: string; qty: number }) => void | Promise<void>; onBack?: () => void; cta?: string }) {
  const profile = useProfile();
  const units = food.units ?? [];
  const [unit, setUnit] = useState<string>(units[0]?.label ?? 'g');
  const [qty, setQty] = useState<number | undefined>(units.length ? 1 : 100);
  const u = units.find((x) => x.label === unit);
  const grams = Math.round((qty ?? 0) * (u ? u.grams : 1) * 10) / 10;
  const nutr = nutrientsFor(food, grams);
  const allergens = allergenMatches(profile?.allergies ?? '', food.allergens);
  const valid = grams > 0 && grams <= 5000;

  return (
    <div className="flex flex-col gap-4">
      {allergens.length > 0 && (
        <Notice tone="warning" icon={<TriangleAlert size={16} />}>
          {fmt(n.allergyWarn, { list: allergens.map((a) => n.allergens[a] ?? a).join(', ') })}
        </Notice>
      )}
      {food.estimated && <Notice>{n.estimatedHint}</Notice>}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">{n.portion}</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={n.portion}>
          {[...units.map((x) => ({ label: x.label, hint: `${num(x.grams)} g` })), { label: 'g', hint: n.grams }].map((x) => (
            <button
              key={x.label}
              type="button"
              role="radio"
              aria-checked={unit === x.label}
              onClick={() => {
                setUnit(x.label);
                setQty(x.label === 'g' ? 100 : 1);
              }}
              className={`min-h-10 rounded-xl border px-3 text-sm transition ${unit === x.label ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface-2'}`}
            >
              {x.label === 'g' ? n.grams : x.label} <span className="opacity-70">{x.label === 'g' ? '' : `(${x.hint})`}</span>
            </button>
          ))}
        </div>
      </div>
      <NumberField label={n.quantity} value={qty} onChange={setQty} unit={unit === 'g' ? 'g' : '×'} />
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['kcal', nutr.kcal],
          ['P', nutr.proteinG],
          ['G', nutr.carbsG],
          ['L', nutr.fatG],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-surface-2 py-2">
            <p className="text-[11px] text-muted">{k}</p>
            <p className="num font-semibold">{num(v as number, 1)}</p>
          </div>
        ))}
      </div>
      <p className="num -mt-2 text-xs text-muted">= {num(grams)} g</p>
      {food.source && <p className="-mt-2 text-xs text-muted">{fmt(n.source, { s: food.source })}</p>}
      <Button size="lg" block disabled={!valid} onClick={() => onAdd(grams, unit === 'g' ? undefined : { label: unit, qty: qty ?? 1 })}>
        {cta}
      </Button>
      {onBack && (
        <Button variant="ghost" block onClick={onBack}>
          {t.common.back}
        </Button>
      )}
    </div>
  );
}

/** Création / modification d'un aliment (valeurs pour 100 g et unités maison). */
export function FoodEditor({ initial, onSaved, onDeleted }: { initial?: Food; onSaved: (f: Food) => void; onDeleted?: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Food>(
    initial ?? { name: '', category: 'dish', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, estimated: false, custom: true, units: [], source: 'Perso' },
  );
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Food>) => {
    setF((x) => ({ ...x, ...patch }));
    setError(undefined);
  };
  const gap = macroKcalGap(f);
  const computed = Math.round(f.proteinG * 4 + f.carbsG * 4 + f.fatG * 9);

  async function save() {
    if (!f.name.trim()) return setError(n.errName);
    const okMacro = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
    if (!(f.kcal >= 0 && f.kcal <= 900) || ![f.proteinG, f.carbsG, f.fatG].every(okMacro)) return setError(n.errValues);
    const units = (f.units ?? []).filter((u) => u.label.trim() && u.grams > 0);
    if (f.price && !(f.price.mad >= 0 && f.price.mad <= 10_000 && f.price.grams > 0)) return setError(n.errValues);
    const row = { ...f, name: f.name.trim().slice(0, 60), units };
    const id = f.id ?? ((await db.foods.add(row)) as number);
    if (f.id) await db.foods.put(row);
    toast(n.saved);
    onSaved({ ...row, id });
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label={n.foodName} value={f.name} onChange={(name) => set({ name })} error={error === n.errName ? error : undefined} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">{t.exercise.category}</span>
        <select value={f.category} onChange={(e) => set({ category: e.target.value })} className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-fg">
          {FOOD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {n.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <p className="-mb-2 text-sm font-medium text-muted">{n.per100}</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={n.kcal} value={f.kcal} onChange={(v) => set({ kcal: v ?? 0 })} />
        <NumberField label={n.protein} value={f.proteinG} onChange={(v) => set({ proteinG: v ?? 0 })} />
        <NumberField label={n.carbs} value={f.carbsG} onChange={(v) => set({ carbsG: v ?? 0 })} />
        <NumberField label={n.fat} value={f.fatG} onChange={(v) => set({ fatG: v ?? 0 })} />
      </div>
      {f.kcal >= 50 && gap > 0.15 && <Notice tone="warning">{fmt(n.kcalGap, { kcal: computed })}</Notice>}
      <MicrosEditor f={f} set={set} />
      <div>
        <p className="mb-2 text-sm font-medium text-muted">{t.nx.priceTitle}</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t.nx.priceMad} unit={t.nx.dh} value={f.price?.mad} onChange={(mad) => set({ price: mad === undefined ? undefined : { mad, grams: f.price?.grams ?? 1000 } })} />
          <NumberField label={t.nx.priceFor} unit="g" value={f.price?.grams ?? 1000} integer onChange={(grams) => set({ price: f.price ? { mad: f.price.mad, grams: grams ?? 1000 } : undefined })} />
        </div>
        <p className="mt-1 text-xs text-muted">{t.nx.priceHint}</p>
      </div>
      <Toggle label={t.nx.addFavorite} checked={!!f.favorite} onChange={(favorite) => set({ favorite })} />
      {error === n.errValues && <p className="text-sm text-danger">{error}</p>}
      <div>
        <p className="mb-2 text-sm font-medium text-muted">{n.unitsTitle}</p>
        <div className="flex flex-col gap-2">
          {(f.units ?? []).map((u, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_2.75rem] items-end gap-2">
              <TextField label={n.unitLabel} value={u.label} placeholder={n.unitLabelPlaceholder} onChange={(label) => set({ units: f.units!.map((x, k) => (k === i ? { ...x, label } : x)) })} />
              <NumberField label={n.unitGramsLabel} value={u.grams} onChange={(grams) => set({ units: f.units!.map((x, k) => (k === i ? { ...x, grams: grams ?? 0 } : x)) })} />
              <button type="button" aria-label={t.common.delete} onClick={() => set({ units: f.units!.filter((_, k) => k !== i) })} className="grid size-11 place-items-center rounded-xl text-muted active:bg-surface-2">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => set({ units: [...(f.units ?? []), { label: '', grams: 100 }] })} icon={<Plus size={16} />}>
            {n.addUnit}
          </Button>
        </div>
      </div>
      <label className="flex min-h-12 items-center justify-between rounded-2xl bg-surface-2 px-4">
        <span className="text-[15px]">{n.estimatedLabel}</span>
        <input type="checkbox" checked={f.estimated} onChange={(e) => set({ estimated: e.target.checked })} className="size-6 accent-[var(--accent-text)]" />
      </label>
      <Button size="lg" block onClick={save}>
        {t.common.save}
      </Button>
      {f.id !== undefined && onDeleted && !confirmDelete && (
        <Button variant="danger" block onClick={() => setConfirmDelete(true)} icon={<Trash2 size={18} />}>
          {n.deleteFood}
        </Button>
      )}
      {confirmDelete && (
        <div className="flex flex-col gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3">
          <p className="text-sm">{n.deleteFoodConfirm}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                await db.foods.delete(f.id!);
                onDeleted?.();
              }}
            >
              {t.common.delete}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const MICRO_MAX: Record<MicroKey, number> = { fiberG: 100, sugarsG: 100, saltG: 100, satFatG: 100, ironMg: 100, calciumMg: 5000, potassiumMg: 10_000, vitDUg: 1000, b12Ug: 1000 };

/** Micronutriments pour 100 g (repliés par défaut ; vide = inconnu, pas zéro). */
function MicrosEditor({ f, set }: { f: Food; set: (patch: Partial<Food>) => void }) {
  const [open, setOpen] = useState(MICRO_KEYS.some((k) => f[k] !== undefined));
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-medium text-muted">
        {t.nx.microsEdit}
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3">
          {MICRO_KEYS.map((k) => (
            <NumberField key={k} label={t.nx.micros[k]} unit={MICRO_UNITS[k]} value={f[k]} onChange={(v) => set({ [k]: v === undefined ? undefined : Math.min(Math.max(0, v), MICRO_MAX[k]) } as Partial<Food>)} />
          ))}
        </div>
      )}
    </div>
  );
}
