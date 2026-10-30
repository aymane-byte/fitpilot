import { useId } from 'react';

interface Props<T extends string | number> {
  label?: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  /** 'row' = barre segmentée ; 'grid' = grosses tuiles (choix avec description). */
  layout?: 'row' | 'grid';
}

export function Segmented<T extends string | number>({ label, value, options, onChange, layout = 'row' }: Props<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span id={id} className="text-sm font-medium text-muted">
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? id : undefined}
        className={layout === 'row' ? 'flex gap-1 rounded-2xl bg-surface-2 p-1 border border-line' : 'grid grid-cols-2 gap-2'}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={
                layout === 'row'
                  ? `flex-1 min-h-10 rounded-xl px-1.5 text-sm font-medium transition ${active ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted active:bg-line'}`
                  : `rounded-2xl border px-3.5 py-3 text-left transition ${active ? 'border-accent-text bg-accent-soft' : 'border-line bg-surface-2 active:bg-line'}`
              }
            >
              {layout === 'row' ? (
                o.label
              ) : (
                <>
                  <span className={`block text-[15px] font-semibold ${active ? 'text-accent-text' : 'text-fg'}`}>{o.label}</span>
                  {o.hint && <span className="mt-0.5 block text-xs leading-snug text-muted">{o.hint}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Sélecteur de nombre 0–7 (séances par semaine). */
export function DayCount({ label, value, onChange, max = 7 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <Segmented
      label={label}
      value={value}
      onChange={onChange}
      options={Array.from({ length: max + 1 }, (_, i) => ({ value: i, label: String(i) }))}
    />
  );
}
