import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { fmt, t } from '@/i18n';
import { todayISO } from '@/lib/dates';
import { runInsights } from '@/lib/runInsights';

const wholeRun = (km: number) => fmt(t.runx.wholeRun, { km: String(km).replace('.', ',') });

/** VDOT, allures et charge calculés sur toutes les courses (recalculés quand elles changent). */
export function useRunInsights() {
  const runs = useLiveQuery(() => db.runs.orderBy('date').toArray());
  return useMemo(() => (runs ? { runs, ...runInsights(runs, todayISO(), wholeRun) } : undefined), [runs]);
}
