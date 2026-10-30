import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { t } from '@/i18n';

/** En-tête collant qui respecte l'encoche (safe-area-inset-top). */
export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: boolean; action?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 pt-safe bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 pb-3 pt-3">
        {back && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t.common.back}
            className="-ml-2 grid size-11 place-items-center rounded-full text-fg active:bg-surface-2"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {subtitle && <p className="text-sm text-muted first-letter:uppercase">{subtitle}</p>}
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
        </div>
        {action}
      </div>
    </header>
  );
}
