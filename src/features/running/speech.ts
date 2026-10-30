// Synthèse vocale (Web Speech API). Sur iOS, la première lecture doit suivre un toucher :
// unlockSpeech() est appelé sur le bouton « Démarrer ».
import { DEFAULT_VOICE, type VoicePrefs } from '@/lib/voice';

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function frenchVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'fr-FR' && v.localService) ?? voices.find((v) => v.lang?.toLowerCase().startsWith('fr'));
}

/** Lit un texte en français. Les annonces ne se coupent pas entre elles (file d'attente). */
export function speak(text: string, opts: { interrupt?: boolean } = {}) {
  if (!text) return;
  // Dernière annonce lisible dans le DOM (sert aux tests de bout en bout, même sans voix installée).
  document.documentElement.dataset.lastSpeech = text;
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  const v = frenchVoice();
  if (v) u.voice = v;
  u.rate = 1;
  synth.speak(u);
}

/** À appeler dans un gestionnaire de toucher : débloque la voix sur iOS (énoncé vide). */
export function unlockSpeech() {
  if (!speechSupported()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export const voicePrefs = (v?: VoicePrefs): VoicePrefs => ({ ...DEFAULT_VOICE, ...v });
