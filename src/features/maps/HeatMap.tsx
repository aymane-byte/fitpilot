import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { t } from '@/i18n';
import { baseOptions, currentTheme, disableRotation, fitPadding, loadMapLibre, resolveStyle, type MapTheme } from './mapCore';

/**
 * Carte de chaleur : chaque course est une ligne lumineuse semi-transparente ; les parcours
 * fréquents s'additionnent et deviennent plus vifs (halo flou + cœur clair).
 */
export default function HeatMap({ tracks, className = 'h-[65dvh]' }: { tracks: [number, number][][]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<MapTheme>(currentTheme);
  const [neutral, setNeutral] = useState(false);

  useEffect(() => {
    const onTheme = () => setTheme(currentTheme());
    window.addEventListener('fitpilot-theme', onTheme);
    return () => window.removeEventListener('fitpilot-theme', onTheme);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lib, { style, neutral: n }] = await Promise.all([loadMapLibre(), resolveStyle(theme)]);
      if (cancelled || !el.current) return;
      setNeutral(n);
      if (map.current) {
        setReady(false);
        // « style.load » (écouté ci-dessous) remet ready à true ; le tracé est alors rajouté.
        map.current.setStyle(style);
        return;
      }
      const mm = new lib.Map({ ...baseOptions(el.current, style), center: [-7.59, 33.57], zoom: 11 });
      disableRotation(mm);
      map.current = mm;
      (el.current as HTMLDivElement & { __map?: MlMap }).__map = mm;
      // Prêt dès que le style est chargé (sans attendre les tuiles : le tracé s'affiche tout de suite).
      // Pas de garde « cancelled » ici : l'écouteur doit survivre aux changements de thème.
      mm.on('style.load', () => setReady(true));
    })();
    return () => {
      cancelled = true;
    };
  }, [theme]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  useEffect(() => {
    const mm = map.current;
    if (!mm || !ready) return;
    const data = { type: 'FeatureCollection' as const, features: tracks.map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: c } })) };
    const src = mm.getSource('heat') as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      mm.addSource('heat', { type: 'geojson', data });
      const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
      mm.addLayer({ id: 'heat-glow', type: 'line', source: 'heat', layout: round, paint: { 'line-color': '#ff4d00', 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.18 } });
      mm.addLayer({ id: 'heat-core', type: 'line', source: 'heat', layout: round, paint: { 'line-color': theme === 'dark' ? '#ffd166' : '#e85d00', 'line-width': 2, 'line-opacity': 0.55 } });
    }
    const all = tracks.flat();
    if (all.length) {
      const lngs = all.map((c) => c[0]);
      const lats = all.map((c) => c[1]);
      mm.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: fitPadding(24), duration: 0, maxZoom: 16 },
      );
    }
  }, [tracks, ready, theme]);

  return (
    <div className={`relative z-0 overflow-hidden rounded-2xl bg-surface-2 ${className}`}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} data-testid="heatmap" role="region" aria-label={t.runx.mapTitle} />
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="absolute bottom-1 left-1.5 rounded px-1 text-[10px] leading-4 text-muted/90 bg-surface/70">
        © OpenStreetMap
      </a>
      {neutral && <p className="absolute bottom-6 left-2 rounded-lg bg-surface/90 px-2 py-1 text-[11px] text-muted">{t.maps.offline}</p>}
    </div>
  );
}
