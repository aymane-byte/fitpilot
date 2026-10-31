import { useCallback, useEffect, useRef, useState } from 'react';
import { movingTime, rejectReason, totalDistance } from '@/lib/geo';
import type { TrackPoint } from '@/lib/runAnalysis';
import { autoPauseDecide, type RawFix } from '@/lib/track';

export type GpsStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type GpsError = 'denied' | 'unavailable' | null;

interface Draft {
  status: GpsStatus;
  points: TrackPoint[];
  seg: number;
  activeMs: number;
  resumedAt: number | null;
  startedAt: number;
  rejected: number;
  /** En pause automatique (arrêt détecté) : le temps ne tourne pas, aucun point n'est ajouté. */
  autoPaused?: boolean;
  anchor?: { lat: number; lng: number } | null;
}

export const DRAFT_KEY = 'fitpilot-gps-draft';
/** Écriture du brouillon au plus toutes les 5 s (et tout de suite si l'app passe en arrière-plan). */
const SAVE_EVERY_MS = 5000;

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* stockage plein ou mode privé : la course continue en mémoire */
  }
}

/** Résumé d'une course non terminée (bannière « Reprendre » hors de l'écran GPS). */
export function draftSummary(): { distanceM: number; activeSec: number; startedAt: number } | null {
  const d = loadDraft();
  if (!d || d.status === 'idle' || d.points.length < 2) return null;
  const extra = d.status === 'running' && d.resumedAt ? Math.max(0, (d.points.at(-1)?.t ?? d.resumedAt) - d.resumedAt) : 0;
  return { distanceM: totalDistance(d.points), activeSec: Math.round((d.activeMs + extra) / 1000), startedAt: d.startedAt };
}

/**
 * Suivi GPS avec filtrage des points, pause manuelle ou automatique (nouveau segment à la reprise)
 * et brouillon sauvegardé en continu : si iOS ferme l'app, la course n'est pas perdue.
 */
export function useGpsTracker(opts: { autoPause?: boolean } = {}) {
  const initial = loadDraft();
  // Un brouillon « en cours » retrouvé après un rechargement est remis en pause.
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? { ...initial, status: initial.status === 'running' ? 'paused' : initial.status, activeMs: initial.activeMs + (initial.status === 'running' && initial.resumedAt ? Math.max(0, (initial.points.at(-1)?.t ?? initial.resumedAt) - initial.resumedAt) : 0), resumedAt: null, autoPaused: false, anchor: null }
      : { status: 'idle', points: [], seg: 0, activeMs: 0, resumedAt: null, startedAt: 0, rejected: 0 },
  );
  const recovered = useRef(!!initial && initial.points.length > 0 && initial.status !== 'idle');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<GpsError>(typeof navigator !== 'undefined' && !('geolocation' in navigator) ? 'unavailable' : null);
  const [now, setNow] = useState(Date.now());
  const watchId = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const autoRef = useRef(opts.autoPause !== false);
  autoRef.current = opts.autoPause !== false;
  const recent = useRef<RawFix[]>([]);
  const lastSave = useRef(0);

  const persist = useCallback((d: Draft, force = false) => {
    if (d.status === 'idle') return writeDraft(null);
    if (!force && Date.now() - lastSave.current < SAVE_EVERY_MS) return;
    lastSave.current = Date.now();
    writeDraft(d);
  }, []);

  const update = useCallback(
    (fn: (d: Draft) => Draft, force = false) => {
      setDraft((d) => {
        const next = fn(d);
        // Changement d'état (départ, pause, fin) : sauvegarde immédiate ; nouveaux points : toutes les 5 s.
        persist(next, force || next.status !== d.status || next.autoPaused !== d.autoPaused);
        return next;
      });
    },
    [persist],
  );

  // iOS peut suspendre ou fermer l'app en arrière-plan : on écrit tout de suite.
  useEffect(() => {
    const flush = () => persist(draftRef.current, true);
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [persist]);

  const onPosition = useCallback(
    (pos: GeolocationPosition) => {
      setAccuracy(Math.round(pos.coords.accuracy));
      setError(null);
      const d = draftRef.current;
      if (d.status !== 'running') return;
      const t = pos.timestamp || Date.now();
      // Décision de pause sur l'horloge du téléphone (même référence que le chrono) : l'horodatage
      // GPS peut venir d'une autre horloge selon les appareils.
      const now = Date.now();
      const fix: RawFix = { t: now, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      recent.current = [...recent.current.filter((f) => f.t >= now - 30_000), fix];

      if (autoRef.current) {
        const decision = autoPauseDecide(recent.current, !!d.autoPaused, d.anchor ?? null);
        if (decision?.action === 'pause') {
          // Le temps passé immobile n'est pas compté : l'arrêt est daté au début de l'immobilité.
          update((x) => ({ ...x, autoPaused: true, anchor: { lat: fix.lat, lng: fix.lng }, activeMs: x.activeMs + (x.resumedAt ? Math.max(0, decision.at - x.resumedAt) : 0), resumedAt: null }));
          return;
        }
        if (decision?.action === 'resume') {
          recent.current = [fix];
          update((x) => ({ ...x, autoPaused: false, anchor: null, seg: x.seg + 1, resumedAt: decision.at }));
          return;
        }
        if (d.autoPaused) return;
      }

      const alt = pos.coords.altitude;
      // iOS fournit l'altitude GPS (souvent bruitée : elle est lissée à l'analyse).
      const p: TrackPoint = { t, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, seg: d.seg, ...(typeof alt === 'number' && Number.isFinite(alt) ? { alt } : {}) };
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

  const start = () => {
    recent.current = [];
    update(() => ({ status: 'running', points: [], seg: 0, activeMs: 0, resumedAt: Date.now(), startedAt: Date.now(), rejected: 0, autoPaused: false, anchor: null }), true);
  };
  const pause = () => update((d) => ({ ...d, status: 'paused', autoPaused: false, anchor: null, activeMs: d.activeMs + (d.resumedAt ? Date.now() - d.resumedAt : 0), resumedAt: null }), true);
  const resume = () => {
    recent.current = [];
    update((d) => ({ ...d, status: 'running', seg: d.seg + 1, resumedAt: Date.now(), autoPaused: false, anchor: null }), true);
  };
  const stop = () => {
    update((d) => ({ ...d, status: 'stopped', autoPaused: false, activeMs: d.activeMs + (d.status === 'running' && d.resumedAt ? Date.now() - d.resumedAt : 0), resumedAt: null }), true);
    clearWatch();
  };
  const reset = () => {
    writeDraft(null);
    recovered.current = false;
    setDraft({ status: 'idle', points: [], seg: 0, activeMs: 0, resumedAt: null, startedAt: 0, rejected: 0 });
    ensureWatch();
  };

  const elapsedSec = Math.round((draft.activeMs + (draft.status === 'running' && draft.resumedAt ? Math.max(0, now - draft.resumedAt) : 0)) / 1000);
  const distanceM = totalDistance(draft.points);

  return {
    ...draft,
    autoPaused: !!draft.autoPaused,
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
