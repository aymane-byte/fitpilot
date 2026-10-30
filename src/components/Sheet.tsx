import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '@/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Plusieurs feuilles peuvent se chevaucher (l'une se ferme quand l'autre s'ouvre) :
// le défilement de la page n'est rétabli que quand la dernière est fermée.
let openSheets = 0;

/** Feuille modale ancrée en bas (style iOS), fermeture par le fond, le bouton ou Échap. */
export function Sheet({ open, onClose, title, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    openSheets++;
    document.body.style.overflow = 'hidden';
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      openSheets--;
      if (openSheets === 0) document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-[28px] bg-surface border-t border-line px-4 pt-3 pb-safe animate-sheet outline-none"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted active:bg-line"
          >
            <X size={18} />
          </button>
        </div>
        <div className="pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
