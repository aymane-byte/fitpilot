import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MlMap, Marker, Popup } from 'maplibre-gl';
import { Crosshair, Mountain } from 'lucide-react';
import { t } from '@/i18n';
import { num } from '@/i18n';
import { formatPace } from '@/lib/running';
import { nearestInfo, routeGeo, type RoutePoint } from '@/lib/routeGeo';
import { baseOptions, currentTheme, disableRotation, fitPadding, loadMapLibre, resolveStyle, setHillshade, type MapTheme } from './mapCore';

const m = t.maps;

/**
 * Carte d'une course (MapLibre, vectorielle, nette sur Retina) :
 * - tracé épais avec contour, coins arrondis, couleur selon l'allure (`colored`) ;
 * - trous GPS en pointillés ; départ (vert), arrivée (damier), marqueurs de km ;
 * - toucher le tracé : distance, allure, altitude ;
 * - `live` : point de position avec halo, suivi de la position, bouton « Recentrer ».
 * Le fond suit le thème clair/sombre de l'app ; relief en option.
 */
export default function RunMap({ points, colored = true, live = false, className = 'h-64', fullScreen = false }: { points: RoutePoint[]; colored?: boolean; live?: boolean; className?: string; fullScreen?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const popup = useRef<Popup | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [ready, setReady] = useState(false);
  const [neutral, setNeutral] = useState(false);
  const [theme, setTheme] = useState<MapTheme>(currentTheme);
  const [relief, setRelief] = useState(false);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  followRef.current = follow;
  const geo = useMemo(() => routeGeo(points, colored && !live), [points, colored, live]);

  // Suivi du thème de l'app (clair / sombre).
  useEffect(() => {
    const onTheme = () => setTheme(currentTheme());
    window.addEventListener('fitpilot-theme', onTheme);
    return () => window.removeEventListener('fitpilot-theme', onTheme);
  }, []);

  // Création de la carte, puis changement de style à chaque changement de thème.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lib, { style, neutral: isNeutral }] = await Promise.all([loadMapLibre(), resolveStyle(theme)]);
      if (cancelled || !el.current) return;
      setNeutral(isNeutral);
      if (map.current) {
        setReady(false);
        // « style.load » (écouté ci-dessous) remet ready à true ; le tracé est alors rajouté.
        map.current.setStyle(style);
        return;
      }
      const mm = new lib.Map({ ...baseOptions(el.current, style), center: [-7.59, 33.57], zoom: 13 });
      disableRotation(mm);
      map.current = mm;
      (el.current as HTMLDivElement & { __map?: MlMap }).__map = mm; // accès pour les tests de bout en bout
      // Prêt dès que le style est chargé (sans attendre les tuiles : le tracé s'affiche tout de suite).
      // Pas de garde « cancelled » ici : l'écouteur doit survivre aux changements de thème.
      mm.on('style.load', () => setReady(true));
      // Geste de l'utilisateur (glisser, pincer, molette) : on arrête de suivre la position.
      mm.on('movestart', (e) => live && 'originalEvent' in e && e.originalEvent && setFollow(false));
      mm.on('click', (e) => {
        if (live) return;
        const hit = mm.queryRenderedFeatures([[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]], { layers: ['route-line'] });
        if (!hit.length) return;
        const info = nearestInfo(pointsRef.current, e.lngLat);
        if (!info) return;
        popup.current?.remove();
        popup.current = new lib.Popup({ closeButton: false, offset: 12, className: 'fp-popup' })
          .setLngLat([info.lng, info.lat])
          .setHTML(`<strong>${num(info.km, 2)} km</strong><br>${m.pace} ${info.paceSec ? formatPace(info.paceSec) + ' /km' : '–'}${info.alt !== undefined ? `<br>${m.altitude} ${info.alt} m` : ''}`)
          .addTo(mm);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [theme, live]);

  useEffect(
    () => () => {
      markers.current.forEach((x) => x.remove());
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  // Couches : contour, tracé, trous en pointillés, position en direct.
  useEffect(() => {
    const mm = map.current;
    if (!mm || !ready) return;
    const dark = theme === 'dark';
    const accent = dark ? '#c6ff3d' : '#3a5f00';
    const lines = { type: 'FeatureCollection' as const, features: geo.lines };
    const gaps = { type: 'FeatureCollection' as const, features: geo.gaps };
    const src = mm.getSource('route') as GeoJSONSource | undefined;
    if (src) {
      src.setData(lines);
      (mm.getSource('gaps') as GeoJSONSource).setData(gaps);
    } else {
      mm.addSource('route', { type: 'geojson', data: lines });
      mm.addSource('gaps', { type: 'geojson', data: gaps });
      const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
      mm.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: round, paint: { 'line-color': dark ? '#0a0a0b' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 10] } });
      mm.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: round, paint: { 'line-color': ['case', ['==', ['get', 'color'], ''], accent, ['get', 'color']], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6] } });
      mm.addLayer({ id: 'route-gaps', type: 'line', source: 'gaps', layout: { 'line-cap': 'round' }, paint: { 'line-color': dark ? '#9b9ba5' : '#55565e', 'line-width': 3, 'line-dasharray': [1, 2] } });
    }
    if (relief) setHillshade(mm, true, theme);
    else if (mm.getLayer('hillshade')) mm.setLayoutProperty('hillshade', 'visibility', 'none');

    // Marqueurs HTML (fonctionnent aussi sur le fond neutre hors-ligne, sans polices de carte).
    void loadMapLibre().then((lib) => {
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      if (!geo.start) return;
      const mk = (cls: string, at: [number, number], text = '', label = '') => {
        const node = document.createElement('div');
        node.className = cls;
        node.textContent = text;
        if (label) node.setAttribute('aria-label', label);
        markers.current.push(new lib.Marker({ element: node }).setLngLat(at).addTo(mm));
      };
      if (live) {
        mk('fp-pos', geo.end!, '', m.position);
      } else {
        for (const k of geo.kmMarks) mk('fp-km', [k.lng, k.lat], String(k.km), `km ${k.km}`);
        mk('fp-start', geo.start, '', m.start);
        mk('fp-finish', geo.end!, '', m.finish);
      }
    });

    if (live) {
      if (followRef.current && geo.end) mm.easeTo({ center: geo.end, zoom: Math.max(mm.getZoom(), 16), duration: 600 });
    } else if (geo.bounds) {
      mm.fitBounds(geo.bounds, { padding: fullScreen ? fitPadding(40) : 32, duration: 0, maxZoom: 17 });
    }
  }, [geo, ready, theme, relief, live, fullScreen]);

  return (
    <div className={`relative z-0 overflow-hidden rounded-2xl bg-surface-2 ${className}`}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} data-testid="run-map" aria-label={m.mapLabel} role="region" />
      <div className="absolute top-2 right-2 flex flex-col gap-2">
        {!neutral && !live && (
          <button type="button" aria-pressed={relief} aria-label={m.relief} onClick={() => setRelief((v) => !v)} className={`grid size-10 place-items-center rounded-full shadow-md ${relief ? 'bg-accent text-accent-ink' : 'bg-surface text-fg'}`}>
            <Mountain size={18} />
          </button>
        )}
        {live && !follow && (
          <button type="button" onClick={() => setFollow(true)} className="flex min-h-10 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-semibold text-fg shadow-md" data-testid="recenter">
            <Crosshair size={16} /> {m.recenter}
          </button>
        )}
      </div>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="absolute bottom-1 left-1.5 rounded px-1 text-[10px] leading-4 text-muted/90 bg-surface/70">
        © OpenStreetMap
      </a>
      {neutral && <p className="absolute bottom-6 left-2 rounded-lg bg-surface/90 px-2 py-1 text-[11px] text-muted">{m.offline}</p>}
    </div>
  );
}
