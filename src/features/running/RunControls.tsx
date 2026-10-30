// Petits contrôles partagés : choix des chaussures, effort ressenti.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { FieldWrap } from '@/components/Field';
import { t } from '@/i18n';

const x = t.runx;

export function ShoeSelect({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const shoes = useLiveQuery(() => db.shoes.toArray());
  if (!shoes?.length) return null;
  const options = shoes.filter((s) => !s.retired || s.id === value);
  return (
    <FieldWrap label={x.shoe}>
      {(id) => (
        <select
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-fg outline-none focus:border-accent-text"
        >
          <option value="">{x.noShoe}</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </FieldWrap>
  );
}

/** Effort ressenti 1–10 en une rangée de boutons. */
export function RpePicker({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted" id="rpe-label">
        {x.rpe} {value ? `· ${value} – ${x.rpeLabels[value]}` : ''}
      </span>
      <div role="radiogroup" aria-labelledby="rpe-label" className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} – ${x.rpeLabels[n]}`}
            onClick={() => onChange(value === n ? undefined : n)}
            className={`num h-10 rounded-xl text-sm font-semibold ${value === n ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted active:bg-line'}`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{x.rpeHint}</p>
    </div>
  );
}
