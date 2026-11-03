import { useCallback, useEffect, useRef, useState } from 'react';
import { GPS_FILTER, haversine, movingTime, rejectReason, totalDistance } from '@/lib/geo';
import type { TrackPoint } from '@/lib/runAnalysis';
import { autoPauseDecide, type RawFix } from '@/lib/track';
import { elapsedMs, GAP_MIN_SEC } from '@/lib/liveRun';
import { clearLive, loadLive, rewriteLive, saveLive } from './liveStore';

export type GpsStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type GpsError = 'denied' | 'unavailable' | null;

export type LivePointT = TrackPoint & { gapBefore?: boolean };

export interface LiveGap {
  /** Indice du point qui suit le trou. */
  index: number;
  sec: number;
  distanceM: number;
}

interface Draft {
  status: GpsStatus;
  points: LivePointT[];
  seg: number;
  activeMs: number;
  resumedAt: number | null;
  startedAt: number;
  rejected: number;
  /** En pause automatique (arrêt détecté) : le temps ne tourne pas, aucun point n'est ajouté. */
  autoPaused?: boolean;
  anchor?: { lat: number; lng: number } | null;
  /** Dernier trou GPS détecté, en attente de « garder / retirer ». */
  pendingGap?: LiveGap | null;
}

/** Écriture au plus toutes les 5 s (et tout de suite si l'app passe en arrière-plan). */
const SAVE_EVERY_MS = 5000;
const IDLE: Draft = { status: 'idle', points: [], seg: 0, activeMs: 0, resumedAt: null, startedAt: 0, rejected: 0 };

/**
 * Suivi GPS fiable malgré les limites d'iOS :
 * - chrono calculé à partir des horodatages (départ, pauses), jamais en comptant des « ticks » ;
 * - état et points sauvegardés en continu dans IndexedDB ; au retour, la course reprend seule ;
 * - trous GPS (app suspendue, écran verrouillé) détectés : ligne droite estimée, à garder ou retirer ;
 * - pause automatique facultative quand on s'arrête.
 */
export function useGpsTracker(opts: { autoPause?: boolean; maxSpeed?: number } = {}) {
  const [draft, setDraft] = useState<Draft>(IDLE);
  const [loaded, setLoaded] = useState(false);
  const [recovered, setRecovered] = useState(false);
  /** Retour au premier plan après une suspension (s), affiché tant qu'aucun point n'est arrivé. */
  const [suspendedSec, setSuspendedSec] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<GpsError>(typeof navigator !== 'undefined' && !('geolocation' in navigator) ? 'unavailable' : null);
  const [now, setNow] = useState(Date.now());
  const watchId = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const autoRef = useRef(opts.autoPause === true);
  autoRef.current = opts.autoPause === true;
  // Vitesse maximale crédible : plus élevée à vélo (sinon les points seraient rejetés).
  const speedRef = useRef(opts.maxSpeed);

  const recent = useRef<RawFix[]>([]);
  const lastSave = useRef(0);
  const flushed = useRef(0);
  const saving = useRef<Promise<void>>(Promise.resolve());

  // Écritures en file (jamais deux transactions concurrentes sur les mêmes points).
  const persist = useCallback((d: Draft, opts: { force?: boolean; rewrite?: boolean } = {}) => {
    if (!opts.force && !opts.rewrite && Date.now() - lastSave.current < SAVE_EVERY_MS) return;
    lastSave.current = Date.now();
    const snap = d.status === 'idle' ? null : { state: { status: d.status as 'running' | 'paused' | 'stopped', seg: d.seg, activeMs: d.activeMs, resumedAt: d.resumedAt, startedAt: d.startedAt, rejected: d.rejected }, points: d.points };
    saving.current = saving.current
      .then(async () => {
        if (!snap) {
          await clearLive();
          flushed.current = 0;
        } else if (opts.rewrite || snap.points.length < flushed.current) flushed.current = await rewriteLive(snap);
        else flushed.current = await saveLive(snap, flushed.current);
      })
      .catch(() => {
        /* stockage indisponible : la course continue en mémoire */
      });
  }, []);

  const update = useCallback(
    (fn: (d: Draft) => Draft, opts: { force?: boolean; rewrite?: boolean } = {}) => {
      setDraft((d) => {
        const next = fn(d);
        persist(next, { ...opts, force: opts.force || next.status !== d.status || next.autoPaused !== d.autoPaused });
        return next;
      });
    },
    [persist],
  );

  // Reprise après fermeture / rechargement : une course « en cours » continue toute seule.
  useEffect(() => {
    let cancelled = false;
    void loadLive().then((snap) => {
      if (cancelled) return;
      if (snap && snap.points.length) {
        flushed.current = snap.points.length;
        // Le chrono continue sur les horodatages : le temps passé app fermée est compté (comme
        // une montre) ; le trou GPS correspondant sera signalé au prochain point.
        setDraft({ ...snap.state, points: snap.points, autoPaused: false, anchor: null, pendingGap: null });
        setRecovered(true);
        if (snap.state.status === 'running') {
          const lastT = snap.points.at(-1)!.t;
          const away = (Date.now() - lastT) / 1000;
          if (away > GAP_MIN_SEC) setSuspendedSec(Math.round(away));
        }
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // iOS peut suspendre ou fermer l'app en arrière-plan : écriture immédiate ; au retour,
  // si aucun point n'est arrivé depuis plus de 30 s, on prévient que le GPS a été interrompu.
  useEffect(() => {
    const onVis = () => {
      const d = draftRef.current;
      if (document.visibilityState === 'hidden') persist(d, { force: true });
      else if (d.status === 'running' && !d.autoPaused && d.points.length) {
        const away = (Date.now() - d.points.at(-1)!.t) / 1000;
        if (away > GAP_MIN_SEC) setSuspendedSec(Math.round(away));
      }
    };
    const onHide = () => persist(draftRef.current, { force: true });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [persist]);

  const onPosition = useCallback(
    (pos: GeolocationPosition) => {
      setAccuracy(Math.round(pos.coords.accuracy));
      setError(null);
      const d = draftRef.current;
      if (d.status !== 'running') return;
      // Horloge du téléphone : même référence que le chrono (l'horodatage GPS peut différer).
      const t = Date.now();
      const fix: RawFix = { t, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      recent.current = [...recent.current.filter((f) => f.t >= t - 30_000), fix];

      if (autoRef.current) {
        const decision = autoPauseDecide(recent.current, !!d.autoPaused, d.anchor ?? null);
        if (decision?.action === 'pause') {
          // Le temps passé immobile n'est pas compté : l'arrêt est daté au début de l'immobilité.
          update((x) => ({ ...x, autoPaused: true, anchor: { lat: fix.lat, lng: fix.lng }, activeMs: elapsedMs(x, decision.at), resumedAt: null }));
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
      const prev = d.points.at(-1);
      // Trou GPS : plus de 30 s sans point dans le même segment (app suspendue, écran verrouillé).
      const gapSec = prev && (prev.seg ?? 0) === d.seg ? (t - prev.t) / 1000 : 0;
      const isGap = gapSec > GAP_MIN_SEC;
      const p: LivePointT = { t, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, seg: d.seg, ...(typeof alt === 'number' && Number.isFinite(alt) ? { alt } : {}), ...(isGap ? { gapBefore: true } : {}) };
      if (isGap) {
        if (fix.accuracy > 25) return; // attendre un point fiable pour relier les deux bouts
        setSuspendedSec(null);
        const gap: LiveGap = { index: d.points.length, sec: Math.round(gapSec), distanceM: Math.round(haversine(prev!, p)) };
        update((x) => ({ ...x, points: [...x.points, p], pendingGap: gap }), { force: true });
        return;
      }
      const reason = rejectReason(prev, p, { ...GPS_FILTER, maxSpeed: speedRef.current ?? GPS_FILTER.maxSpeed });
      if (reason === 'jitter') return; // bruit à l'arrêt : ni gardé ni compté comme rejet
      setSuspendedSec(null);
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

  // Rafraîchissement de l'affichage uniquement : le temps vient de elapsedMs().
  useEffect(() => {
    if (draft.status !== 'running') return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [draft.status]);

  const start = () => {
    recent.current = [];
    flushed.current = 0;
    update(() => ({ ...IDLE, status: 'running', resumedAt: Date.now(), startedAt: Date.now(), autoPaused: false, anchor: null }), { rewrite: true });
  };
  const pause = () => update((d) => ({ ...d, status: 'paused', autoPaused: false, anchor: null, activeMs: elapsedMs(d, Date.now()), resumedAt: null }), { force: true });
  const resume = () => {
    recent.current = [];
    update((d) => ({ ...d, status: 'running', seg: d.seg + 1, resumedAt: Date.now(), autoPaused: false, anchor: null }), { force: true });
  };
  const stop = () => {
    update((d) => ({ ...d, status: 'stopped', autoPaused: false, activeMs: d.status === 'running' ? elapsedMs(d, Date.now()) : d.activeMs, resumedAt: null }), { force: true });
    clearWatch();
  };
  /** Garde la ligne droite estimée du trou (distance comptée, marquée « estimée »). */
  const keepGap = () => update((d) => ({ ...d, pendingGap: null }));
  /** Retire le trou : ni la distance en ligne droite ni le temps pendant l'interruption ne sont comptés. */
  const removeGap = () =>
    update(
      (d) => {
        const g = d.pendingGap;
        if (!g) return d;
        const points = d.points.map((p, i) => (i >= g.index ? { ...p, seg: d.seg + 1, gapBefore: false } : p));
        // Temps de l'interruption retiré du chrono (en avançant l'heure de reprise si la course tourne).
        const ms = g.sec * 1000;
        const clock = d.resumedAt !== null ? { resumedAt: d.resumedAt + ms } : { activeMs: Math.max(0, d.activeMs - ms) };
        return { ...d, points, seg: d.seg + 1, ...clock, pendingGap: null };
      },
      { rewrite: true },
    );
  const reset = () => {
    persist(IDLE, { force: true });
    setRecovered(false);
    setSuspendedSec(null);
    setDraft(IDLE);
    ensureWatch();
  };

  const elapsedSec = Math.round(elapsedMs(draft.status === 'running' ? draft : { ...draft, resumedAt: null }, now) / 1000);
  // Sans point depuis plus de 30 s en pleine course : GPS probablement interrompu (app suspendue).
  const lastT = draft.points.at(-1)?.t;
  const staleSec = draft.status === 'running' && !draft.autoPaused && !draft.pendingGap && lastT ? Math.round((now - lastT) / 1000) : 0;
  const shownSuspended = suspendedSec ?? (staleSec > GAP_MIN_SEC ? staleSec : null);
  const distanceM = totalDistance(draft.points);

  return {
    ...draft,
    loaded,
    autoPaused: !!draft.autoPaused,
    pendingGap: draft.pendingGap ?? null,
    suspendedSec: shownSuspended,
    recovered,
    accuracy,
    error,
    elapsedSec,
    distanceM,
    estimatedM: draft.points.reduce((s, p, i) => s + (p.gapBefore && i > 0 && (draft.points[i - 1].seg ?? 0) === (p.seg ?? 0) ? haversine(draft.points[i - 1], p) : 0), 0),
    movingSec: movingTime(draft.points),
    start,
    pause,
    resume,
    stop,
    keepGap,
    removeGap,
    reset,
    /** Vitesse maximale crédible selon l'activité (vélo plus rapide). */
    setMaxSpeed: (v: number) => {
      speedRef.current = v;
    },
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
