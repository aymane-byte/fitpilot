import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Category, Equipment, Exercise } from '@/db/types';
import { t } from '@/i18n';
import { normalizeText } from '@/lib/text';

const x = t.exercise;
const CATEGORIES: Category[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'core', 'cardio'];
const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band'];

/** Normalise pour la recherche (sans accents, minuscules). */
export const norm = normalizeText;

export function useExerciseSearch() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray()) ?? [];
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return exercises.filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        (!q || norm(e.name).includes(q) || e.muscles.some((m) => norm(x.muscles[m] ?? m).includes(q)) || norm(x.equipment[e.equipment] ?? '').includes(q)),
    );
  }, [exercises, query, cat]);
  return { filtered, query, setQuery, cat, setCat };
}

export function SearchBar({ query, setQuery, cat, setCat }: Pick<ReturnType<typeof useExerciseSearch>, 'query' | 'setQuery' | 'cat' | 'setCat'>) {
  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">{x.search}</span>
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={x.search}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 pr-4 pl-11 text-fg outline-none placeholder:text-muted/70 focus:border-accent-text"
        />
      </label>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {(['all', ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${cat === c ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted'}`}
          >
            {c === 'all' ? x.all : x.categories[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExerciseRow({ e, onClick }: { e: Exercise; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {e.name}
            {e.custom && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-text">{x.custom}</span>}
          </span>
          <span className="block truncate text-xs text-muted">
            {x.categories[e.category]} · {x.equipment[e.equipment]}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const search = useExerciseSearch();
  const [creating, setCreating] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={creating ? x.newTitle : t.live.addExercise}>
      {creating ? (
        <ExerciseForm
          onCreated={(e) => {
            setCreating(false);
            onPick(e);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <SearchBar {...search} />
          {search.filtered.length === 0 ? (
            <p className="py-4 text-sm text-muted">{x.empty}</p>
          ) : (
            <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
              {search.filtered.map((e) => (
                <ExerciseRow key={e.id} e={e} onClick={() => onPick(e)} />
              ))}
            </ul>
          )}
          <Button variant="secondary" block onClick={() => setCreating(true)} icon={<Plus size={18} />}>
            {x.create}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

export function ExerciseForm({ onCreated }: { onCreated: (e: Exercise) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('chest');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [muscles, setMuscles] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string>();

  async function save() {
    if (!name.trim()) {
      setError(x.name);
      return;
    }
    const ex: Exercise = {
      name: name.trim().slice(0, 60),
      category,
      equipment,
      muscles: muscles.split(',').map((m) => m.trim()).filter(Boolean).slice(0, 8),
      instructions: instructions.trim().slice(0, 500),
      mistakes: '',
      custom: true,
    };
    const id = (await db.exercises.add(ex)) as number;
    toast(x.created);
    onCreated({ ...ex, id });
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label={x.name} value={name} onChange={(v) => { setName(v); setError(undefined); }} error={error} autoFocus />
      <Segmented layout="grid" label={x.category} value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: x.categories[c] }))} />
      <Segmented layout="grid" label={x.equipmentLabel} value={equipment} onChange={setEquipment} options={EQUIPMENT.map((c) => ({ value: c, label: x.equipment[c] }))} />
      <TextField label={x.musclesLabel} value={muscles} onChange={setMuscles} placeholder={x.musclesPlaceholder} />
      <TextField label={x.instructionsLabel} value={instructions} onChange={setInstructions} />
      <Button size="lg" block onClick={save}>
        {t.common.save}
      </Button>
    </div>
  );
}
