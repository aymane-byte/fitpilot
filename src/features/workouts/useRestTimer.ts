import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'fitpilot-rest-end';
let audioCtx: AudioContext | undefined;

/** Doit être appelé pendant un geste utilisateur (iOS n'autorise le son qu'après une interaction). */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* pas de son disponible */
  }
}

function beep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const [i, freq] of [880, 880, 1320].entries()) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.25 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.25 + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + i * 0.25);
    osc.stop(now + i * 0.25 + 0.22);
  }
}

function readEnd(): number | null {
  try {
    const v = Number(sessionStorage.getItem(KEY));
    return v > Date.now() ? v : null;
  } catch {
    return null;
  }
}

/** Minuteur de repos basé sur l'heure de fin (reste juste même si l'onglet est mis en veille). */
export function useRestTimer() {
  const [endAt, setEndAt] = useState<number | null>(readEnd);
  const [now, setNow] = useState(Date.now());
  const [justFinished, setJustFinished] = useState(false);
  const fired = useRef(false);

  const persist = (v: number | null) => {
    try {
      if (v) sessionStorage.setItem(KEY, String(v));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* rien */
    }
  };

  useEffect(() => {
    if (!endAt) return;
    fired.current = false;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endAt && !fired.current) {
        fired.current = true;
        beep();
        navigator.vibrate?.([200, 100, 200]);
        setEndAt(null);
        persist(null);
        setJustFinished(true);
        setTimeout(() => setJustFinished(false), 3000);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const start = useCallback((seconds: number) => {
    unlockAudio();
    const end = Date.now() + seconds * 1000;
    setEndAt(end);
    setNow(Date.now());
    persist(end);
  }, []);

  const add = useCallback((seconds: number) => {
    setEndAt((e) => {
      if (!e) return e;
      const next = Math.max(Date.now() + 1000, e + seconds * 1000);
      persist(next);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setEndAt(null);
    persist(null);
  }, []);

  return { remaining: endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 0, active: !!endAt, justFinished, start, add, stop };
}
