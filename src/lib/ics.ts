// Export iCalendar (.ics) : l'app Calendrier de l'iPhone gère les rappels à notre place.
import type { ISODate } from './dates';

export interface IcsEvent {
  uid: string;
  date: ISODate;
  /** Heure locale « HH:MM » ; sans heure, l'événement dure toute la journée. */
  time?: string;
  durationMin?: number;
  title: string;
  description?: string;
  /** Rappel X minutes avant. */
  alarmMin?: number;
}

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Coupe les lignes à 75 octets (RFC 5545). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const compact = (d: ISODate) => d.replace(/-/g, '');

function addMinutes(date: ISODate, time: string, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + minutes);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}T${p(dt.getHours())}${p(dt.getMinutes())}00`;
}

export function buildIcs(events: IcsEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FitPilot AI//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      // Heure « flottante » (locale du téléphone) : pas de fuseau à gérer.
      lines.push(`DTSTART:${addMinutes(e.date, e.time, 0)}`, `DTEND:${addMinutes(e.date, e.time, e.durationMin ?? 60)}`);
    } else {
      const [y, m, d] = e.date.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      const p = (n: number) => String(n).padStart(2, '0');
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${next.getFullYear()}${p(next.getMonth() + 1)}${p(next.getDate())}`);
    }
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.alarmMin !== undefined) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.title)}`, `TRIGGER:-PT${e.alarmMin}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
