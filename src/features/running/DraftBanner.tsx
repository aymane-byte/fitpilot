import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin } from 'lucide-react';
import { db } from '@/db/db';
import { fmt, num, t } from '@/i18n';
import { totalDistance } from '@/lib/geo';
import { elapsedMs } from '@/lib/liveRun';
import { formatDuration } from '@/lib/running';

/** Course GPS en cours ou interrompue (app fermée en pleine course) : bannière pour y revenir. */
export function DraftBanner() {
  const { pathname } = useLocation();
  const summary = useLiveQuery(async () => {
    const s = await db.liveRun.get('current');
    if (!s) return null;
    const pts = await db.livePoints.orderBy('t').toArray();
    if (pts.length < 2) return null;
    return { distanceM: totalDistance(pts), activeSec: Math.round(elapsedMs(s, Date.now()) / 1000) };
  });
  if (!summary || pathname === '/course/gps') return null;
  return (
    <Link
      to="/course/gps"
      data-testid="draft-banner"
      className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-warning px-4 py-3 text-sm font-semibold text-bg shadow-lg"
    >
      <MapPin size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {fmt(t.gpsx.banner, { km: num(summary.distanceM / 1000, 2), time: formatDuration(summary.activeSec) })} <span className="underline underline-offset-2">{t.gpsx.bannerCta}</span>
      </span>
    </Link>
  );
}
