import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-3xl bg-surface border border-line p-4 animate-rise ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        {icon && <span className="text-accent-text">{icon}</span>}
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Message d'état vide ou de fonctionnalité à venir : toujours dire quoi faire ou quand. */
export function Notice({ icon, children, tone = 'muted' }: { icon?: ReactNode; children: ReactNode; tone?: 'muted' | 'warning' }) {
  const tones = {
    muted: 'bg-surface-2 text-muted',
    warning: 'bg-warning/10 text-warning border border-warning/25',
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm leading-snug ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
