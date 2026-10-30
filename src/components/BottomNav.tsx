import { NavLink } from 'react-router-dom';
import { Apple, Dumbbell, Footprints, House, LayoutGrid, MessageCircle } from 'lucide-react';
import { t } from '@/i18n';

const items = [
  { to: '/', label: t.nav.home, Icon: House, end: true },
  { to: '/muscu', label: t.nav.gym, Icon: Dumbbell },
  { to: '/course', label: t.nav.run, Icon: Footprints },
  { to: '/nutrition', label: t.nav.nutrition, Icon: Apple },
  { to: '/coach', label: t.nav.coach, Icon: MessageCircle },
  { to: '/plus', label: t.nav.more, Icon: LayoutGrid },
];

/** Barre d'onglets fixe ; le padding bas respecte l'indicateur d'accueil (safe-area-inset-bottom). */
export function BottomNav() {
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl pb-safe pl-safe pr-safe">
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition ${isActive ? 'text-accent-text' : 'text-muted active:text-fg'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
