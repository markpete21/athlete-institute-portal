import 'server-only';
import { randomBytes } from 'node:crypto';
import { audit } from '@ai/foundation';
import { supabaseAdmin } from '@ai/foundation/supabase';

/**
 * Calendar sync (ICS): long-lived tokened feed URLs that Google/Apple/Outlook
 * subscribe to and poll. One feed per (user, kind) - asking again returns the
 * same URL, so the subscription never breaks.
 */

export interface CalendarFeed {
  id: number;
  token: string;
  kind: 'master' | 'family';
  family_id: number | null;
}

export async function getOrCreateFeed(
  kind: 'master' | 'family',
  createdBy: string,
  familyId?: number | null,
): Promise<CalendarFeed> {
  if (kind === 'family' && !familyId) throw new Error('Family feed needs a family.');
  const db = supabaseAdmin();
  let q = db.from('calendar_feeds').select('id, token, kind, family_id').eq('created_by', createdBy).eq('kind', kind);
  if (kind === 'family') q = q.eq('family_id', familyId!);
  const { data: existing } = await q.limit(1);
  if (existing?.length) return existing[0] as CalendarFeed;

  const { data, error } = await db
    .from('calendar_feeds')
    .insert({
      token: randomBytes(24).toString('base64url'),
      kind,
      family_id: kind === 'family' ? familyId : null,
      created_by: createdBy,
    })
    .select('id, token, kind, family_id')
    .single();
  if (error) throw new Error(`feed create failed: ${error.message}`);
  await audit({ actorId: createdBy, action: 'calendar-feed.created', target: `calendar-feed:${data.id}`, meta: { kind } });
  return data as CalendarFeed;
}

export async function getFeedByToken(token: string): Promise<CalendarFeed | null> {
  const { data } = await supabaseAdmin()
    .from('calendar_feeds')
    .select('id, token, kind, family_id')
    .eq('token', token)
    .maybeSingle();
  return (data as CalendarFeed) ?? null;
}

// ---------------------------------------------------------------------------
// ICS building (RFC 5545 - the subset calendar apps actually read)
// ---------------------------------------------------------------------------

export interface FeedEvent {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  status: 'tentative' | 'confirmed';
  facilityName: string;
}

const icsStamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Fold long lines at 74 octets per RFC 5545 (continuation lines start with a space). */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

export function buildICS(name: string, events: FeedEvent[]): string {
  const now = icsStamp(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Athlete Institute//Play Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsEscape(name)}`),
    'X-WR-TIMEZONE:America/Toronto',
    // Ask clients to refresh often (both spellings for coverage).
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:booking-${e.id}@play.athleteinstitute.ca`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsStamp(e.starts_at)}`,
      `DTEND:${icsStamp(e.ends_at)}`,
      fold(`SUMMARY:${icsEscape(e.title)}${e.status === 'tentative' ? ' (hold)' : ''}`),
      fold(`LOCATION:${icsEscape(e.facilityName)}`),
      `STATUS:${e.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
