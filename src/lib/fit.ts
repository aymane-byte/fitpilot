// Import FIT (montres Garmin, Coros, Suunto, Polar…) avec fit-file-parser (licence MIT),
// chargé à la demande pour ne pas alourdir l'app.
import { TrackImportError, type ImportedTrack } from './gpx';
import type { TrackPoint } from './runAnalysis';

interface FitRecord {
  timestamp?: Date | string | number;
  position_lat?: number;
  position_long?: number;
  altitude?: number;
  enhanced_altitude?: number;
}

interface FitSession {
  sport?: string | number;
  total_timer_time?: number;
  total_distance?: number;
}

/** Transforme la sortie de fit-file-parser (mode « list », unités m) en trace. Exporté pour les tests. */
export function trackFromFitData(data: { records?: FitRecord[]; sessions?: FitSession[] }): ImportedTrack {
  const session = data.sessions?.[0];
  const sport = session?.sport;
  if (typeof sport === 'string' && sport !== 'running' && sport !== 'generic' && sport !== 'walking' && sport !== 'hiking') throw new TrackImportError('notRun');
  const points: TrackPoint[] = [];
  for (const r of data.records ?? []) {
    const lat = r.position_lat;
    const lng = r.position_long;
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const t = r.timestamp instanceof Date ? r.timestamp.getTime() : typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : r.timestamp;
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    const alt = r.enhanced_altitude ?? r.altitude;
    points.push({ t, lat, lng, accuracy: 5, seg: 0, ...(typeof alt === 'number' && Number.isFinite(alt) ? { alt } : {}) });
  }
  if (!points.length) throw new TrackImportError('empty');
  points.sort((a, b) => a.t - b.t);
  return {
    activity: typeof sport === 'string' ? sport : undefined,
    points,
    timerSec: session?.total_timer_time ? Math.round(session.total_timer_time) : undefined,
    distanceM: session?.total_distance ? Math.round(session.total_distance) : undefined,
  };
}

export async function parseFit(buffer: ArrayBuffer): Promise<ImportedTrack> {
  const { default: FitParser } = await import('fit-file-parser');
  const parser = new FitParser({ force: true, mode: 'list', lengthUnit: 'm', speedUnit: 'm/s' });
  let data;
  try {
    data = await parser.parseAsync(buffer);
  } catch {
    throw new TrackImportError('invalid');
  }
  return trackFromFitData(data as never);
}
