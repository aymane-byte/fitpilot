import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, FileBarChart, Images, Settings, Smartphone, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { t } from '@/i18n';

const m = t.more;

function Row({ to, icon, label, hint }: { to?: string; icon: ReactNode; label: string; hint: string }) {
  const inner = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${to ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-muted'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-medium ${to ? '' : 'text-muted'}`}>{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      {to && <ChevronRight size={18} className="text-muted" />}
    </>
  );
  const cls = 'flex min-h-16 items-center gap-3 px-4 py-2';
  return <li>{to ? <Link to={to} className={`${cls} active:bg-surface-2`}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>;
}

export function MorePage() {
  return (
    <>
      <PageHeader title={m.title} />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          <Row to="/planning" icon={<CalendarDays size={20} />} label={m.planning} hint={m.planningHint} />
          <Row to="/profil" icon={<UserRound size={20} />} label={m.profile} hint={m.profileHint} />
          <Row to="/parametres" icon={<Settings size={20} />} label={m.settings} hint={m.settingsHint} />
          <Row to="/installer" icon={<Smartphone size={20} />} label={m.install} hint={m.installHint} />
        </ul>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          <Row to="/progres" icon={<Images size={20} />} label={m.progress} hint={m.progressHint} />
          <Row to="/rapports" icon={<FileBarChart size={20} />} label={m.reports} hint={m.reportsHint} />
        </ul>
      </main>
    </>
  );
}
