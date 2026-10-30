import { useCallback, useEffect, useRef, useState } from 'react';
import { movingTime, rejectReason, totalDistance, type GeoPoint } from '@/lib/geo';

export type GpsStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type GpsError = 'denied' | 'unavailable' | null;

interface Draft {
  status: GpsStatus;
  points: GeoPoint[];
  seg: number;
  activeMs: number;
  resumedAt: number | null;
  startedAt: number;
  rejected: number;
}

const KEY = 'fitpilot-gps-draft';

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage plein ou mode privé : la course continue en mémoire */
  }
}

/**
 * Suivi GPS avec filtrage des points, pause/reprise (nouveau segment) et brouillon
 * sauvegardé en continu : si iOS recharge la page, la course n'est pas perdue.
 */
export function useGpsTracker() {
  const initial = loadDraft();
  // Un brouillon « en cours » retrouvé après un rechargement est remis en pause.
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? { ...initial, status: initial.status === 'running' ? 'paused' : initial.status, activeMs: initial.activeMs + (initial.status === 'running' && initial.resumedAt ? Math.max(0, (initial.points.at(-1)?.t ?? initial.resumedAt) - initial.resumedAt) : 0), resumedAt: null }
      : { status: 'idle', points: [], seg: 0, activeMs: 0, resumedAt: null, startedAt: 0, rejected: 0 },
  );
  const recovered = useRef(!!initial && initial.points.length > 0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<GpsError>(typeof navigator !== 'undefined' && !('geolocation' in navigator) ? 'unavailable' : null);
  const [now, setNow] = useState(Date.now());
  const watchId = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => {
      const next = fn(d);
      saveDraft(next.status === 'idle' ? null : next);
      return next;
    });
  }, []);

  const onPosition = useCallback(
    (pos: GeolocationPosition) => {
      setAccuracy(Math.round(pos.coords.accuracy));
      setError(null);
      const d = draftRef.current;
      if (d.status !== 'running') return;
      const p: GeoPoint = { t: pos.timestamp || Date.now(), lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, seg: d.seg };
      const reason = rejectReason(d.points.at(-1), p);
      if (reason === 'jitter') return; // bruit à l'arrêt : ni gardé ni compté comme rejet
      update((x) => (reason ? { ...x, rejected: x.rejected + 1 } : { ...x, points: [...x.points, p] }));
    },
    [update],
  );

  const ensureWatch = useCallback(() => {
    if (watchId.current !== null || !('geolocation' in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      onPosition,
      (err) => setError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [onPosition]);

  const clearWatch = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  };

  // Le GPS est écouté dès l'ouverture de l'écran pour afficher la précision avant le départ.
  useEffect(() => {
    ensureWatch();
    return clearWatch;
  }, [ensureWatch]);

  useEffect(() => {
    if (draft.status !== 'running') return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [draft.status]);

  const start = () => update(() => ({ status: 'running', points: [], seg: 0, activeMs: 0, resumedAt: Date.now(), startedAt: Date.now(), rejected: 0 }));
  const pause = () => update((d) => ({ ...d, status: 'paused', activeMs: d.activeMs + (d.resumedAt ? Date.now() - d.resumedAt : 0), resumedAt: null }));
  const resume = () => update((d) => ({ ...d, status: 'running', seg: d.seg + 1, resumedAt: Date.now() }));
  const stop = () => {
    update((d) => ({ ...d, status: 'stopped', activeMs: d.activeMs + (d.status === 'running' && d.resumedAt ? Date.now() - d.resumedAt : 0), resumedAt: null }));
    clearWatch();
  };
  const reset = () => {
    saveDraft(null);
    recovered.current = false;
    setDraft({ status: 'idle', points: [], seg: 0, activeMs: 0, resumedAt: null, startedAt: 0, rejected: 0 });
    ensureWatch();
  };

  const elapsedSec = Math.round((draft.activeMs + (draft.status === 'running' && draft.resumedAt ? now - draft.resumedAt : 0)) / 1000);
  const distanceM = totalDistance(draft.points);

  return {
    ...draft,
    recovered: recovered.current,
    accuracy,
    error,
    elapsedSec,
    distanceM,
    movingSec: movingTime(draft.points),
    start,
    pause,
    resume,
    stop,
    reset,
  };
}

/** Garde l'écran allumé tant que `active` (Screen Wake Lock API, iOS 16.4+ / Safari 16.4+). */
export function useWakeLock(active: boolean): 'on' | 'unsupported' | 'off' {
  const [state, setState] = useState<'on' | 'unsupported' | 'off'>('off');
  useEffect(() => {
    if (!active) return;
    if (!('wakeLock' in navigator)) {
      setState('unsupported');
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!cancelled) setState('on');
        lock.addEventListener('release', () => !cancelled && setState('off'));
      } catch {
        if (!cancelled) setState('unsupported');
      }
    };
    void request();
    // Le verrou est relâché quand l'app passe en arrière-plan : on le redemande au retour.
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
      setState('off');
    };
  }, [active]);
  return state;
}
