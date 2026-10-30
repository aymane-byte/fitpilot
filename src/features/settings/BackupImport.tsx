import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { importData, parseBackup, type BackupFile } from '@/db/backup';
import { fmt, t } from '@/i18n';

const s = t.settings;

/** Bouton « Restaurer » : choix du fichier, validation, aperçu du contenu, confirmation. */
export function BackupImport({ variant = 'secondary', label = s.import, onDone }: { variant?: 'secondary' | 'ghost'; label?: string; onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [pending, setPending] = useState<{ backup: BackupFile; counts: Record<string, number> }>();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const res = parseBackup(await file.text());
    if (input.current) input.current.value = '';
    if (!res.ok) toast(res.error, 'error');
    else setPending({ backup: res.backup, counts: res.counts });
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await importData(pending.backup);
      setPending(undefined);
      toast(s.importDone);
      onDone?.();
    } catch {
      toast(t.errors.generic, 'error');
    } finally {
      setBusy(false);
    }
  }

  const date = pending ? new Date(pending.backup.exportedAt).toLocaleString(t.meta.locale, { dateStyle: 'long', timeStyle: 'short' }) : '';
  const nonEmpty = pending ? Object.entries(pending.counts).filter(([, n]) => n > 0) : [];

  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="backup-file" />
      <Button variant={variant} block onClick={() => input.current?.click()} icon={<Upload size={18} />}>
        {label}
      </Button>
      <Sheet open={!!pending} onClose={() => setPending(undefined)} title={s.importTitle}>
        <div className="flex flex-col gap-4">
          <Notice tone="warning">{fmt(s.importText, { date })}</Notice>
          <div>
            <p className="mb-2 text-sm font-medium text-muted">{s.importCounts}</p>
            <ul className="divide-y divide-line rounded-2xl bg-surface-2 text-sm">
              {nonEmpty.map(([name, n]) => (
                <li key={name} className="flex justify-between px-4 py-2.5">
                  <span>{t.tables[name] ?? name}</span>
                  <span className="num text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <Button size="lg" block onClick={confirm} disabled={busy}>
            {busy ? s.importing : t.common.confirm}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
