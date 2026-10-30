import type { ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useToast } from './Toast';
import { t } from '@/i18n';

/** Confirmation d'une action (souvent destructive), avec un bouton Annuler explicite. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel = t.common.confirm,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {children && <div className="text-muted">{children}</div>}
        <Button
          size="lg"
          block
          variant={danger ? 'danger' : 'primary'}
          onClick={async () => {
            try {
              await onConfirm();
            } catch (e) {
              console.error(e);
              toast(t.errors.generic, 'error');
            }
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
        <Button size="lg" block variant="secondary" onClick={onClose}>
          {t.common.cancel}
        </Button>
      </div>
    </Sheet>
  );
}
