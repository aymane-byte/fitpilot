/** true si l'app tourne depuis l'écran d'accueil (PWA installée). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function isIOS(ua = navigator.userAgent): boolean {
  // Les iPad récents se présentent comme « Macintosh » avec écran tactile.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Chrome, Firefox, Edge… sur iOS : l'installation passe plus sûrement par Safari. */
export function isIOSNonSafari(ua = navigator.userAgent): boolean {
  return isIOS(ua) && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
