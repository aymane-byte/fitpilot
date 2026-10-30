import { useEffect } from 'react';
import type { ThemePref } from '@/db/types';

const THEME_COLORS = { dark: '#0a0a0b', light: '#f4f4f1' };

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(pref: ThemePref) {
  const theme = resolve(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  // Copie dans localStorage pour appliquer le thème avant le chargement de la base (index.html).
  try {
    localStorage.setItem('fitpilot-theme', pref);
  } catch {
    /* mode privé : sans conséquence */
  }
  window.dispatchEvent(new Event('fitpilot-theme'));
}

/** Applique le thème choisi et suit le thème système si « Système ». */
export function useApplyTheme(pref: ThemePref | undefined) {
  useEffect(() => {
    if (!pref) return;
    applyTheme(pref);
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
}

/** Lit une variable CSS du thème courant (pour Chart.js, qui ne comprend pas var()). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
