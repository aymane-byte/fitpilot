import { useEffect, useState } from 'react';
import { BellRing, Database, Download, HardDrive, Info, Palette, Trash2, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { db, updateSettings } from '@/db/db';
import { backupFileName, exportData, needsBackupReminder, shareOrDownload } from '@/db/backup';
import type { ThemePref } from '@/db/types';
import { useSettings } from '@/hooks/useData';
import { fmt, t } from '@/i18n';
import { BackupImport } from './BackupImport';
import { CoachSettingsCard } from '../coach/CoachSettings';

const s = t.settings;

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title={s.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Card>
          <CardTitle icon={<Palette size={18} />}>{s.appearance}</CardTitle>
          <Segmented<ThemePref>
            label={s.theme}
            value={settings?.theme ?? 'dark'}
            options={(['dark', 'light', 'system'] as const).map((v) => ({ value: v, label: t.options.theme[v] }))}
            onChange={(theme) => updateSettings({ theme })}
          />
        </Card>
        <BackupCard lastBackupAt={settings?.lastBackupAt} includePhotos={settings?.backupIncludesPhotos ?? false} />
        <StorageCard />
        {settings && <CoachSettingsCard settings={settings} />}
        <Card>
          <CardTitle icon={<BellRing size={18} />}>{t.reminders.title}</CardTitle>
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2">
            <span>
              <span className="block text-[15px]">{t.reminders.setting}</span>
              <span className="block text-xs text-muted">{t.reminders.settingHint}</span>
            </span>
            <input type="checkbox" checked={settings?.inAppReminders !== false} onChange={(e) => updateSettings({ inAppReminders: e.target.checked })} className="size-6 shrink-0 accent-[var(--accent-text)]" />
          </label>
        </Card>
        <Card>
          <CardTitle icon={<Info size={18} />}>{s.about}</CardTitle>
          <p className="text-sm text-muted">{fmt(s.version, { v: __APP_VERSION__ })}</p>
          <p className="mt-1 mb-4 text-sm text-muted">{s.privacy}</p>
          <ResetButton />
        </Card>
      </main>
    </>
  );
}

function BackupCard({ lastBackupAt, includePhotos }: { lastBackupAt?: number; includePhotos: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    try {
      const json = JSON.stringify(await exportData({ includePhotos }));
      const result = await shareOrDownload(json, backupFileName());
      if (result === 'cancelled') toast(s.exportCancelled, 'error');
      else {
        await updateSettings({ lastBackupAt: Date.now() });
        toast(s.exported);
      }
    } catch {
      toast(t.errors.generic, 'error');
    } finally {
      setBusy(false);
    }
  }

  const last = lastBackupAt ? new Date(lastBackupAt).toLocaleString(t.meta.locale, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <Card id="sauvegarde">
      <CardTitle icon={<Database size={18} />}>{s.backup}</CardTitle>
      <div className="flex flex-col gap-3">
        {last ? (
          <p className="text-sm text-muted">{fmt(s.lastBackup, { date: last })}</p>
        ) : (
          <Notice tone="warning" icon={<TriangleAlert size={16} />}>
            {s.neverBackup}
          </Notice>
        )}
        {last && needsBackupReminder(lastBackupAt) && (
          <Notice tone="warning" icon={<TriangleAlert size={16} />}>
            {s.backupReminder}
          </Notice>
        )}
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-2">
          <span>
            <span className="block text-[15px]">{s.includePhotos}</span>
            <span className="block text-xs text-muted">{s.includePhotosHint}</span>
          </span>
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => updateSettings({ backupIncludesPhotos: e.target.checked })}
            className="size-6 shrink-0 accent-[var(--accent-text)]"
          />
        </label>
        <Button block onClick={doExport} disabled={busy} icon={<Download size={18} />}>
          {s.export}
        </Button>
        <p className="text-xs text-muted">{s.exportHint}</p>
        <BackupImport />
      </div>
    </Card>
  );
}

type PersistState = 'unknown' | 'persisted' | 'not' | 'denied';

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} Go`;
}

function StorageCard() {
  const [state, setState] = useState<PersistState>('unknown');
  const [usage, setUsage] = useState<{ used: number; quota: number }>();

  useEffect(() => {
    navigator.storage?.persisted?.().then((p) => setState(p ? 'persisted' : 'not'));
    navigator.storage?.estimate?.().then((e) => e.quota && setUsage({ used: e.usage ?? 0, quota: e.quota }));
  }, []);

  async function ask() {
    const granted = await navigator.storage.persist();
    setState(granted ? 'persisted' : 'denied');
  }

  const supported = !!navigator.storage?.persist;
  const text =
    !supported ? s.persistUnknown : state === 'persisted' ? s.persisted : state === 'denied' ? s.persistDenied : state === 'not' ? s.notPersisted : s.persistUnknown;

  return (
    <Card>
      <CardTitle icon={<HardDrive size={18} />}>{s.storage}</CardTitle>
      <div className="flex flex-col gap-3">
        <Notice tone={state === 'persisted' ? 'muted' : 'warning'}>
          <span data-testid="persist-status">{text}</span>
        </Notice>
        {usage && <p className="text-sm text-muted">{fmt(s.usage, { used: formatBytes(usage.used), quota: formatBytes(usage.quota) })}</p>}
        {supported && state !== 'persisted' && (
          <Button variant="secondary" block onClick={ask}>
            {s.persistAsk}
          </Button>
        )}
      </div>
    </Card>
  );
}

function ResetButton() {
  const [open, setOpen] = useState(false);
  async function reset() {
    await db.delete();
    localStorage.clear();
    location.replace(location.pathname);
  }
  return (
    <>
      <Button variant="danger" block onClick={() => setOpen(true)} icon={<Trash2 size={18} />}>
        {s.reset}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={s.resetTitle}>
        <div className="flex flex-col gap-4">
          <p className="text-muted">{s.resetText}</p>
          <Button variant="danger" size="lg" block onClick={reset}>
            {s.resetConfirm}
          </Button>
          <Button variant="secondary" size="lg" block onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
