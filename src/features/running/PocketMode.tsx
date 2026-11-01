import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n';
import { num } from '@/i18n';
import { formatDuration } from '@/lib/running';

const UNLOCK_MS = 1500;
const SWIPE_PX = 160;

/**
 * Mode poche : écran entièrement noir qui intercepte tous les touchers (rien ne se déclenche
 * dans la poche). Le Wake Lock de l'écran GPS reste actif, la voix continue.
 * Déverrouillage : appui long (1,5 s) ou glissement vers le haut. Temps et distance en tout
 * petit, gris très sombre (pixels presque éteints sur écran OLED).
 */
export function PocketMode({ elapsedSec, distanceM, wake, onExit }: { elapsedSec: number; distanceM: number; wake: 'on' | 'unsupported' | 'off'; onExit: () => void }) {
  const [progress, setProgress] = useState(0);
  const start = useRef<{ t: number; y: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    const prev = document.documentElement.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.documentElement.style.overscrollBehavior = prev;
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const tick = () => {
    if (!start.current) return;
    const p = Math.min(1, (performance.now() - start.current.t) / UNLOCK_MS);
    setProgress(p);
    if (p >= 1) {
      start.current = null;
      onExit();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const down = (y: number) => {
    start.current = { t: performance.now(), y };
    raf.current = requestAnimationFrame(tick);
  };
  const up = () => {
    start.current = null;
    cancelAnimationFrame(raf.current);
    setProgress(0);
  };
  const move = (y: number) => {
    if (start.current && start.current.y - y > SWIPE_PX) {
      up();
      onExit();
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.gpsr.pocket}
      data-testid="pocket-mode"
      className="fixed inset-0 z-[100] flex touch-none select-none flex-col items-center justify-between bg-black pt-safe pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#2a2a2a]"
      onPointerDown={(e) => {
        e.preventDefault();
        down(e.clientY);
      }}
      onPointerMove={(e) => move(e.clientY)}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mt-16 text-center">
        <p className="num text-2xl font-semibold" data-testid="pocket-time">
          {formatDuration(elapsedSec)}
        </p>
        <p className="num text-base">{num(distanceM / 1000, 2)} km</p>
      </div>
      <div className="flex flex-col items-center gap-3 px-8 text-center text-xs">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-[#141414]">
          <div className="h-full bg-[#333]" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-sm text-[#3a3a3a]">
          {t.gpsr.pocketUnlock}
          <br />
          {t.gpsr.pocketUnlockSwipe}
        </p>
        <p>{wake === 'on' ? t.gpsr.pocketWake : t.gpsr.pocketWakeOff}</p>
        <p>{t.gpsr.pocketTip}</p>
      </div>
    </div>,
    document.body,
  );
}
