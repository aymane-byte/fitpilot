import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileUp, TriangleAlert } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import type { RunType } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { TrackImportError } from '@/lib/gpx';
import { formatDuration, formatPace, paceSecPerKm } from '@/lib/running';
import { RUN_TYPES } from '@/lib/runTypes';
import { readTrackFile, saveImportedRun, type ImportPreview } from './service';

const x = t.runx;

export function ImportRunSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [type, setType] = useState<RunType>('easy');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    try {
      const p = await readTrackFile(file);
      setPreview(p);
      setType(p.suggestedType);
    } catch (e) {
      setError(x.importErr[e instanceof TrackImportError ? e.code : 'invalid']);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function save() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const id = await saveImportedRun(preview, type);
      toast(x.importDone);
      onClose();
      navigate(`/course/${id}`);
    } catch {
      setError(x.importErr.pace);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={x.importTitle}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{x.importText}</p>
        <Link to="/course/import-strava" onClick={onClose} className="text-sm font-semibold text-accent-text underline underline-offset-2">
          {t.gpsr.stravaTitle} : {t.gpsr.stravaHint}
        </Link>
        <input ref={input} type="file" accept=".gpx,.fit,.gz,application/gpx+xml,application/octet-stream,application/gzip" className="sr-only" aria-label={x.chooseFile} onChange={(e) => onFile(e.target.files?.[0])} />
        <Button size="lg" variant="secondary" block disabled={busy} onClick={() => input.current?.click()} icon={<FileUp size={18} />}>
          {busy ? x.importReading : x.chooseFile}
        </Button>
        {error && (
          <Notice tone="warning" icon={<TriangleAlert size={16} />}>
            {error}
          </Notice>
        )}
        {preview && (
          <>
            <div className="rounded-2xl bg-surface-2 p-3.5" data-testid="import-preview">
              {preview.name && <p className="font-semibold">{preview.name}</p>}
              <p className="text-sm text-muted first-letter:uppercase">{formatDateFr(preview.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="num mt-1 text-lg font-semibold">
                {num(preview.distanceKm, 2)} km · {formatDuration(preview.durationSec)} · {formatPace(paceSecPerKm(preview.distanceKm, preview.durationSec))} {t.run.perKm}
              </p>
              <p className="text-xs text-muted">
                {preview.format.toUpperCase()} · {fmt(x.importPoints, { n: preview.points.length })} · {preview.hasAltitude ? x.importAltYes : x.importAltNo}
              </p>
            </div>
            {preview.duplicateOf && <Notice tone="warning">{x.importDuplicate}</Notice>}
            <Segmented layout="grid" label={t.run.type} value={type} onChange={setType} options={RUN_TYPES.map((v) => ({ value: v, label: t.run.types[v] }))} />
            <Button size="lg" block onClick={save} disabled={busy}>
              {busy ? x.importSaving : x.importSave}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
