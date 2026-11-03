// Import / export GPX 1.1 (Strava, montres, applis de course). Analyse avec DOMParser, sans dépendance.
import type { TrackPoint } from './runAnalysis';
import { typeFromActivity } from './runTypes';

export interface ImportedTrack {
  name?: string;
  /** Type d'activité déclaré par le fichier (ex. « running », « cycling »), si présent. */
  activity?: string;
  points: TrackPoint[];
  /** Temps en mouvement fourni par le fichier (FIT), sinon calculé. */
  timerSec?: number;
  distanceM?: number;
}

export class TrackImportError extends Error {
  constructor(public code: 'invalid' | 'empty' | 'noTime' | 'notRun') {
    super(code);
  }
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function buildGpx(name: string, points: TrackPoint[]): string {
  const segs = new Map<number, TrackPoint[]>();
  for (const p of points) segs.set(p.seg ?? 0, [...(segs.get(p.seg ?? 0) ?? []), p]);
  const body = [...segs.values()]
    .map(
      (seg) =>
        `    <trkseg>\n${seg
          .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">${typeof p.alt === 'number' ? `<ele>${p.alt.toFixed(1)}</ele>` : ''}<time>${new Date(p.t).toISOString()}</time></trkpt>`)
          .join('\n')}\n    </trkseg>`,
    )
    .join('\n');
  const start = points[0] ? new Date(points[0].t).toISOString() : new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FitPilot AI" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><time>${start}</time></metadata>
  <trk>
    <name>${esc(name)}</name>
    <type>running</type>
${body}
  </trk>
</gpx>
`;
}


export function parseGpx(text: string): ImportedTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'gpx') throw new TrackImportError('invalid');
  const byName = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));
  const trk = byName(doc, 'trk')[0];
  const name = trk ? byName(trk, 'name')[0]?.textContent?.trim() : undefined;
  const activity = trk ? byName(trk, 'type')[0]?.textContent?.trim() : undefined;
  if (activity && !typeFromActivity(activity)) throw new TrackImportError('notRun');
  const points: TrackPoint[] = [];
  let missingTime = 0;
  byName(doc, 'trkseg').forEach((seg, s) => {
    for (const pt of byName(seg, 'trkpt')) {
      const lat = Number(pt.getAttribute('lat'));
      const lng = Number(pt.getAttribute('lon'));
      const time = byName(pt, 'time')[0]?.textContent;
      const ele = byName(pt, 'ele')[0]?.textContent;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const t = time ? Date.parse(time) : NaN;
      if (!Number.isFinite(t)) {
        missingTime++;
        continue;
      }
      const alt = ele !== undefined && ele !== null && ele.trim() !== '' ? Number(ele) : undefined;
      points.push({ t, lat, lng, accuracy: 5, seg: s, ...(alt !== undefined && Number.isFinite(alt) ? { alt } : {}) });
    }
  });
  if (!points.length) throw new TrackImportError(missingTime ? 'noTime' : 'empty');
  points.sort((a, b) => a.t - b.t);
  return { name: name || undefined, activity, points };
}
