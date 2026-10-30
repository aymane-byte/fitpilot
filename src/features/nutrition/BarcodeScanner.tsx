import { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, ScanBarcode, Square } from 'lucide-react';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import { TextField } from '@/components/Field';
import { t } from '@/i18n';

const x = t.nx;
type ScanError = 'denied' | 'unavailable' | null;

/**
 * Lecture de code-barres EAN/UPC avec ZXing (JavaScript pur, fonctionne dans Safari iOS,
 * qui n'a pas BarcodeDetector). Chargé à la demande. Repli : photo du code ou saisie manuelle.
 */
export function BarcodeScanner({ onCode, busy }: { onCode: (code: string) => void; busy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ScanError>(null);
  const [photoError, setPhotoError] = useState(false);
  const [manual, setManual] = useState('');
  const photo = useRef<HTMLInputElement>(null);

  const stop = () => {
    controls.current?.stop();
    controls.current = null;
    setRunning(false);
  };
  useEffect(() => stop, []);

  async function reader() {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
  }

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('unavailable');
      return;
    }
    try {
      const r = await reader();
      setRunning(true);
      controls.current = await r.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current!, (result) => {
        if (!result) return;
        stop();
        navigator.vibrate?.(60);
        onCode(result.getText());
      });
    } catch (e) {
      setRunning(false);
      setError(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'unavailable');
    }
  }

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(false);
    const url = URL.createObjectURL(file);
    try {
      const r = await reader();
      const res = await r.decodeFromImageUrl(url);
      onCode(res.getText());
    } catch {
      setPhotoError(true);
    } finally {
      URL.revokeObjectURL(url);
      if (photo.current) photo.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative overflow-hidden rounded-2xl bg-black ${running ? 'aspect-[4/3]' : 'hidden'}`}>
        {/* playsInline + muted : indispensables pour la vidéo dans Safari iOS. */}
        <video ref={video} className="h-full w-full object-cover" playsInline muted autoPlay />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-accent" />
      </div>
      {running ? (
        <>
          <p className="text-center text-sm text-muted">{x.scanAim}</p>
          <Button variant="secondary" onClick={stop} icon={<Square size={16} />}>
            {x.scanStop}
          </Button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={start} icon={<Camera size={18} />} disabled={busy}>
            {x.scanStart}
          </Button>
          <Button variant="secondary" onClick={() => photo.current?.click()} icon={<ImageUp size={18} />} disabled={busy}>
            {x.scanPhoto}
          </Button>
        </div>
      )}
      <input ref={photo} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={x.scanPhoto} onChange={(e) => fromPhoto(e.target.files?.[0])} />
      {error && <Notice tone="warning">{error === 'denied' ? x.scanDenied : x.scanUnavailable}</Notice>}
      {photoError && <Notice tone="warning">{x.scanPhotoFail}</Notice>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <div className="flex-1">
          <TextField label={x.manualCode} value={manual} onChange={setManual} inputMode="numeric" autoComplete="off" placeholder="3017624010701" />
        </div>
        <Button type="submit" variant="secondary" disabled={busy || !manual.trim()} icon={<ScanBarcode size={18} />}>
          {busy ? x.looking : x.lookup}
        </Button>
      </form>
    </div>
  );
}
