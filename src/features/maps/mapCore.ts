// Cartes vectorielles MapLibre GL + OpenFreeMap (gratuit, sans clé, sans limite ; attribution
// OpenStreetMap obligatoire). Chargé uniquement par les écrans qui affichent une carte.
//
// Fonds : « positron » (clair épuré) et « dark » (sombre) d'OpenFreeMap, choisis selon le thème.
// Relief : ombrage calculé à partir des « Terrain Tiles » (données ouvertes AWS / Mapzen).
// Hors-ligne : les tuiles déjà vues sont servies par le cache du service worker ; sinon fond neutre.
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

export type MapTheme = 'light' | 'dark';

export const STYLE_URLS: Record<MapTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Mention complète (aussi affichée par le style) — gardée pour les fonds sans attribution. */
export const OSM_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>';
export const DEM_ATTRIBUTION = 'Relief : <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain Tiles</a> (Mapzen, USGS SRTM/GMTED, NOAA ETOPO1, EU-DEM…)';
export const TERRARIUM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

let lib: Promise<typeof import('maplibre-gl')> | null = null;

export function loadMapLibre() {
  if (!lib) {
    lib = import('maplibre-gl').then((m) => {
      m.setWorkerUrl(workerUrl);
      return m;
    });
  }
  return lib;
}

export const currentTheme = (): MapTheme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Fond neutre (aucune tuile) : utilisé hors-ligne quand le style n'est pas en cache. */
export function neutralStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': theme === 'dark' ? '#16171a' : '#ecece7' } }],
  };
}

const styleCache = new Map<MapTheme, Promise<StyleSpecification | null>>();

/** Style vectoriel OpenFreeMap (mis en cache par le service worker) ; null si indisponible. */
export function fetchStyle(theme: MapTheme): Promise<StyleSpecification | null> {
  if (!styleCache.has(theme)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    styleCache.set(
      theme,
      fetch(STYLE_URLS[theme], { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<StyleSpecification>) : null))
        .catch(() => null)
        .finally(() => clearTimeout(timer))
        .then((s) => {
          if (!s) styleCache.delete(theme); // nouvel essai plus tard
          // Les styles OpenFreeMap n'ont pas de nom : on en donne un (repère pour le débogage et les tests).
          else s.name = `OpenFreeMap ${theme === 'dark' ? 'dark' : 'positron'}`;
          return s;
        }),
    );
  }
  return styleCache.get(theme)!;
}

export async function resolveStyle(theme: MapTheme): Promise<{ style: StyleSpecification; neutral: boolean }> {
  const s = await fetchStyle(theme);
  return s ? { style: s, neutral: false } : { style: neutralStyle(theme), neutral: true };
}

/** Options communes : rotation et inclinaison désactivées, attribution compacte. */
export function baseOptions(container: HTMLElement, style: StyleSpecification) {
  return {
    container,
    style,
    // Attribution complète (fournie par le style OpenFreeMap) repliée derrière le bouton (i) ;
    // une mention « © OpenStreetMap » reste toujours visible (voir MapCredit).
    attributionControl: { compact: true } as const,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    fadeDuration: 0,
    // Écran Retina : MapLibre dessine déjà à la densité de l'écran (pas de flou).
    pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
  };
}

export function disableRotation(map: MlMap) {
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // L'attribution compacte s'ouvre au chargement : on la replie pour ne pas cacher le tracé.
  map.once('load', () => map.getContainer().querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
}

/** Ombrage du relief, sous les étiquettes du fond. */
export function setHillshade(map: MlMap, on: boolean, theme: MapTheme) {
  if (!map.getSource('dem')) {
    map.addSource('dem', { type: 'raster-dem', tiles: [TERRARIUM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: DEM_ATTRIBUTION });
  }
  if (!map.getLayer('hillshade')) {
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-exaggeration': 0.45,
          'hillshade-shadow-color': theme === 'dark' ? '#000000' : '#5a5a52',
          'hillshade-highlight-color': theme === 'dark' ? '#3a3a40' : '#ffffff',
          'hillshade-accent-color': theme === 'dark' ? '#111' : '#8a8a80',
        },
      },
      firstSymbol,
    );
  }
  map.setLayoutProperty('hillshade', 'visibility', on ? 'visible' : 'none');
}

/** Marges de cadrage (px) : bord + zone sûre de l'iPhone (encoche, barre d'accueil). */
export function fitPadding(extra = 28): { top: number; bottom: number; left: number; right: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const pad = { top: extra + px(cs.paddingTop), right: extra + px(cs.paddingRight), bottom: extra + px(cs.paddingBottom), left: extra + px(cs.paddingLeft) };
  probe.remove();
  return pad;
}
