import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { parseDecimal } from '@/lib/schemas';

const inputCls =
  'w-full min-h-12 rounded-2xl bg-surface-2 border border-line px-4 text-fg placeholder:text-muted/70 outline-none focus:border-accent-text transition';

interface WrapProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
}

export function FieldWrap({ label, hint, error, children }: WrapProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

interface TextProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
}

export function TextField({ label, value, onChange, hint, error, ...rest }: TextProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error}>
      {(id) => (
        <input id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} {...rest} />
      )}
    </FieldWrap>
  );
}

interface NumberProps {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  hint?: ReactNode;
  error?: string;
  integer?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const toRaw = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));

/** Champ numérique tolérant la virgule française ; garde la saisie brute pendant l'édition. */
export function NumberField({ label, value, onChange, unit, hint, error, integer, placeholder, autoFocus }: NumberProps) {
  const [raw, setRaw] = useState(toRaw(value));
  // Resynchronise si la valeur change de l'extérieur (ex. profil rechargé).
  useEffect(() => {
    setRaw((current) => (parseDecimal(current) === value ? current : toRaw(value)));
  }, [value]);
  return (
    <FieldWrap label={label} hint={hint} error={error}>
      {(id) => (
        <div className="relative">
          <input
            id={id}
            className={`${inputCls} num ${unit ? 'pr-14' : ''}`}
            inputMode={integer ? 'numeric' : 'decimal'}
            value={raw}
            placeholder={placeholder}
            autoFocus={autoFocus}
            aria-invalid={!!error}
            onChange={(e) => {
              setRaw(e.target.value);
              onChange(parseDecimal(e.target.value));
            }}
          />
          {unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">{unit}</span>}
        </div>
      )}
    </FieldWrap>
  );
}

/** Petit champ numérique pour les tableaux de séries (valeur enregistrée à chaque frappe valide). */
export function MiniNumber({ value, onCommit, label, integer, placeholder, className = '' }: { value: number | undefined; onCommit: (v: number | undefined) => void; label: string; integer?: boolean; placeholder?: string; className?: string }) {
  const [raw, setRaw] = useState(toRaw(value));
  useEffect(() => {
    setRaw((current) => (parseDecimal(current) === value ? current : toRaw(value)));
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={raw}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setRaw(e.target.value);
        const v = parseDecimal(e.target.value);
        if (v === undefined || v >= 0) onCommit(v);
      }}
      className={`num h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-1 text-center text-fg outline-none focus:border-accent-text ${className}`}
    />
  );
}

export function TextArea({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode }) {
  return (
    <FieldWrap label={label} hint={hint}>
      {(id) => (
        <textarea
          id={id}
          rows={2}
          className={`${inputCls} py-3 resize-none`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FieldWrap>
  );
}
