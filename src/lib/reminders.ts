// Rappels in-app (affichés à l'ouverture) : pas de push, pas de serveur.
import { daysBetween, type ISODate } from './dates';

export type ReminderKey = 'session' | 'weigh' | 'backup' | 'measure' | 'photo';

export interface Reminder {
  key: ReminderKey;
  /** Données pour le texte (titre de séance, heure, jours écoulés…). */
  vars: Record<string, string | number>;
}

export interface ReminderInput {
  today: ISODate;
  hour: number;
  planned?: { title: string; time?: string; status: string };
  weighedToday: boolean;
  lastBackupAt?: number;
  now: number;
  lastMeasureDate?: ISODate; // tour de taille, etc.
  lastPhotoDate?: ISODate;
  hasProfileForDays: number; // ancienneté de l'utilisateur
}

export const MEASURE_EVERY_DAYS = 7;
export const PHOTO_EVERY_DAYS = 28;

export function reminders(i: ReminderInput): Reminder[] {
  const out: Reminder[] = [];
  if (i.planned && i.planned.status === 'planned') out.push({ key: 'session', vars: { title: i.planned.title, time: i.planned.time ?? '' } });
  if (!i.weighedToday && i.hour < 12) out.push({ key: 'weigh', vars: {} });
  if (i.lastBackupAt === undefined ? i.hasProfileForDays >= 2 : i.now - i.lastBackupAt > 7 * 86_400_000) {
    out.push({ key: 'backup', vars: { days: i.lastBackupAt ? Math.floor((i.now - i.lastBackupAt) / 86_400_000) : 0 } });
  }
  // Mesures hebdo et photos mensuelles : seulement après la première semaine d'utilisation.
  if (i.hasProfileForDays >= MEASURE_EVERY_DAYS) {
    const since = i.lastMeasureDate ? daysBetween(i.lastMeasureDate, i.today) : Infinity;
    if (since >= MEASURE_EVERY_DAYS) out.push({ key: 'measure', vars: {} });
    const photoSince = i.lastPhotoDate ? daysBetween(i.lastPhotoDate, i.today) : Infinity;
    if (photoSince >= PHOTO_EVERY_DAYS) out.push({ key: 'photo', vars: {} });
  }
  return out;
}
