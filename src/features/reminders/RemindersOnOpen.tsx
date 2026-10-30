import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Camera, Dumbbell, HardDriveDownload, Ruler, Scale } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { db, getSettings } from '@/db/db';
import { fmt, t } from '@/i18n';
import { daysBetween, toISODate, todayISO } from '@/lib/dates';
import { reminders, type Reminder, type ReminderKey } from '@/lib/reminders';

const KEY = 'fitpilot-reminders-shown';
const ICONS: Record<ReminderKey, typeof Scale> = { session: Dumbbell, weigh: Scale, backup: HardDriveDownload, measure: Ruler, photo: Camera };
const LINKS: Record<ReminderKey, string> = { session: '/', weigh: '/', backup: '/parametres', measure: '/progres', photo: '/progres' };

export async function computeReminders(today = todayISO()): Promise<Reminder[]> {
  const [profile, settings] = await Promise.all([db.profile.get('me'), getSettings()]);
  if (!profile) return [];
  const [planned, weighed, measures, lastPhoto] = await Promise.all([
    db.scheduledActivities.where('date').equals(today).filter((a) => a.kind !== 'rest').first(),
    db.bodyMeasurements.where('date').equals(today).filter((m) => m.weightKg !== undefined).count(),
    db.bodyMeasurements.orderBy('date').reverse().filter((m) => m.waistCm !== undefined).first(),
    db.progressPhotos.orderBy('date').last(),
  ]);
  return reminders({
    today,
    hour: new Date().getHours(),
    planned: planned && { title: planned.title, time: planned.time, status: planned.status },
    weighedToday: weighed > 0,
    lastBackupAt: settings.lastBackupAt,
    now: Date.now(),
    lastMeasureDate: measures?.date,
    lastPhotoDate: lastPhoto?.date,
    hasProfileForDays: daysBetween(toISODate(new Date(profile.createdAt)), today),
  });
}

/** Feuille « Rappels du jour », affichée au plus une fois par jour à l'ouverture de l'app. */
export function RemindersOnOpen() {
  const navigate = useNavigate();
  const [list, setList] = useState<Reminder[]>([]);
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(KEY) === today) return;
      } catch {
        /* stockage indisponible : on affiche quand même */
      }
      const settings = await getSettings();
      if (settings.inAppReminders === false) return;
      const r = await computeReminders(today);
      if (!cancelled && r.length) setList(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const close = () => {
    try {
      localStorage.setItem(KEY, today);
    } catch {
      /* rien */
    }
    setList([]);
  };

  const rm = t.reminders;
  return (
    <Sheet open={list.length > 0} onClose={close} title={rm.title}>
      <ul className="flex flex-col gap-2">
        {list.map((r) => {
          const Icon = ICONS[r.key];
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => {
                  close();
                  navigate(LINKS[r.key]);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 text-left active:bg-line"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <Icon size={20} />
                </span>
                <span className="text-[15px]">{fmt(rm[r.key], r.vars).trim()}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button className="mt-4" size="lg" block onClick={close} icon={<BellRing size={18} />}>
        {rm.ok}
      </Button>
    </Sheet>
  );
}
