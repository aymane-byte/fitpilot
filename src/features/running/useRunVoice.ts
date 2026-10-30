import { useEffect, useMemo, useRef, useState } from 'react';
import { advance, expandWorkout, initialEngine, paceAlertText, paceFeedback, shouldAlertPace, stepAnnouncement, stepStatus, type EngineState, type GuidedWorkoutDef, type PaceFeedback } from '@/lib/guided';
import { announceMark, distanceAnnouncement, type VoicePrefs } from '@/lib/voice';
import { t } from '@/i18n';
import { speak } from './speech';

/**
 * Annonces pendant la course (chaque km) et guidage d'une séance (étapes, allure).
 * Tout est piloté par le temps actif et la distance du tracker GPS : rien ne tourne en pause.
 */
export function useRunVoice(opts: {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  elapsedSec: number;
  distanceM: number;
  currentPace: number;
  avgPace: number;
  prefs: VoicePrefs;
  workout: GuidedWorkoutDef | null;
}) {
  const { status, elapsedSec, distanceM, currentPace, avgPace, prefs, workout } = opts;
  const steps = useMemo(() => (workout ? expandWorkout(workout) : []), [workout]);
  const [engine, setEngine] = useState<EngineState>(initialEngine);
  const [feedback, setFeedback] = useState<PaceFeedback | null>(null);
  const lastMark = useRef(0);
  const lastMarkSec = useRef(0);
  const lastAlert = useRef<number | null>(null);
  const announcedStart = useRef(false);

  // Réinitialisation quand une nouvelle course démarre.
  useEffect(() => {
    if (status === 'idle') {
      setEngine(initialEngine());
      lastMark.current = 0;
      lastMarkSec.current = 0;
      lastAlert.current = null;
      announcedStart.current = false;
      setFeedback(null);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'running') return;
    const say = (text: string) => prefs.enabled && speak(text);

    if (steps.length && !announcedStart.current) {
      announcedStart.current = true;
      say(stepAnnouncement(steps[0]));
    }

    // Annonce de distance (chaque km par défaut).
    const mark = announceMark(distanceM, prefs.everyKm);
    if (mark > lastMark.current) {
      const splitSec = elapsedSec - lastMarkSec.current;
      const splitKm = (mark - lastMark.current) * prefs.everyKm;
      lastMark.current = mark;
      lastMarkSec.current = elapsedSec;
      // En séance guidée, l'annonce d'étape a priorité : pas d'annonce de km pendant un effort court.
      if (!steps.length || stepStatus(steps, engine, elapsedSec, distanceM).step?.kind !== 'work') {
        say(distanceAnnouncement({ distanceM: mark * prefs.everyKm * 1000, elapsedSec, splitSec, splitKm, avgPaceSec: avgPace }, prefs));
      }
    }

    if (!steps.length || engine.done) return;
    const res = advance(steps, engine, elapsedSec, distanceM);
    if (res.started.length || res.finished) {
      setEngine(res.state);
      lastAlert.current = null;
      setFeedback(null);
      if (res.finished) say(t.runx.workoutDoneSpeech);
      else say(stepAnnouncement(steps[res.started.at(-1)!]));
      return;
    }
    const st = stepStatus(steps, engine, elapsedSec, distanceM);
    if (st.step?.pace) {
      const fb = paceFeedback(currentPace, st.step.pace, st.step.tolerance);
      setFeedback(fb);
      const inStep = elapsedSec - engine.startSec;
      if (prefs.paceAlerts && shouldAlertPace(fb, inStep, lastAlert.current, elapsedSec)) {
        lastAlert.current = elapsedSec;
        say(paceAlertText(fb!));
      }
    } else setFeedback(null);
    // elapsedSec change chaque seconde : c'est l'horloge du guidage.
  }, [status, elapsedSec, distanceM, currentPace, avgPace, prefs, steps, engine]);

  return { steps, engine, status: steps.length ? stepStatus(steps, engine, elapsedSec, distanceM) : null, feedback };
}
