import { useEffect, useState, type ReactNode } from 'react';

/**
 * Ligne avec case à cocher (grande zone de toucher, libellé cliquable).
 * L'état local réagit tout de suite ; la valeur enregistrée le resynchronise ensuite.
 */
export function Toggle({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(checked);
  useEffect(() => setLocal(checked), [checked]);
  return (
    <label className={`flex min-h-11 items-center justify-between gap-3 ${disabled ? 'opacity-40' : ''}`}>
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={local}
        disabled={disabled}
        onChange={(e) => {
          setLocal(e.target.checked);
          onChange(e.target.checked);
        }}
        className="size-6 shrink-0 accent-[var(--accent-text)]"
      />
    </label>
  );
}
