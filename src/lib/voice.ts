// Textes des annonces vocales (lus par speechSynthesis en français).
// Les nombres sont écrits pour être bien prononcés : « 5 minutes 12 » plutôt que « 5:12 ».

export interface VoicePrefs {
  enabled: boolean;
  /** Intervalle entre deux annonces de distance (km). */
  everyKm: number;
  time: boolean;
  splitPace: boolean;
  avgPace: boolean;
  /** Annonces « trop rapide / trop lent » des séances guidées. */
  paceAlerts: boolean;
}

export const DEFAULT_VOICE: VoicePrefs = { enabled: true, everyKm: 1, time: true, splitPace: true, avgPace: true, paceAlerts: true };

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « 1 heure 5 minutes », « 25 minutes 12 secondes », « 45 secondes ». */
export function spokenDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(plural(h, 'heure'));
  if (m) parts.push(plural(m, 'minute'));
  // Au-delà d'une heure, les secondes n'apportent rien à l'oreille.
  if (r && !h) parts.push(plural(r, 'seconde'));
  return parts.length ? parts.join(' ') : '0 seconde';
}

/** « 5 minutes 12 par kilomètre ». */
export function spokenPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return 'allure inconnue';
  const s = Math.round(secPerKm);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${plural(m, 'minute')}${r ? ` ${r}` : ''} par kilomètre`;
}

/** « 3 kilomètres », « 2,5 kilomètres », « 400 mètres ». */
export function spokenDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} mètres`;
  const km = Math.round(meters / 100) / 10;
  const txt = Number.isInteger(km) ? String(km) : String(km).replace('.', ',');
  return `${txt} kilomètre${km >= 2 ? 's' : ''}`;
}

export function distanceAnnouncement(
  info: { distanceM: number; elapsedSec: number; splitSec?: number; splitKm: number; avgPaceSec: number },
  prefs: VoicePrefs,
): string {
  const parts = [spokenDistance(info.distanceM) + '.'];
  if (prefs.time) parts.push(`Temps : ${spokenDuration(info.elapsedSec)}.`);
  if (prefs.splitPace && info.splitSec && info.splitKm > 0) parts.push(`Dernier kilomètre : ${spokenPace(info.splitSec / info.splitKm)}.`);
  if (prefs.avgPace) parts.push(`Allure moyenne : ${spokenPace(info.avgPaceSec)}.`);
  return parts.join(' ');
}

/** Numéro de la dernière borne d'annonce franchie (0 si aucune). */
export function announceMark(distanceM: number, everyKm: number): number {
  if (everyKm <= 0) return 0;
  return Math.floor(distanceM / (everyKm * 1000) + 1e-9);
}
