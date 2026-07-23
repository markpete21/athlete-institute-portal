import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@ai/foundation/supabase';
import { createBooking } from '@/lib/bookings';
import { createDisplay, getDisplayContent, upsertTemplate } from '@/lib/displays';

/**
 * DEV-ONLY: Stage-6 displays end to end - template + display creation,
 * unauthenticated token-URL fetch (200 + only public bookings), facility
 * scoping, unknown token, today/upcoming split. Cleaned up.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });
  const madeBookings: number[] = [];
  let displayId: number | null = null;
  let templateId: number | null = null;

  try {
    const { data: fac } = await db.from('facilities').select('id, name').is('deleted_at', null);
    const idOf = (name: string) => fac!.find((f) => f.name === name)!.id;
    const dome = idOf('Dome');
    const fieldhouse = idOf('Fieldhouse');
    const today = new Date();
    const at = (h: number, plusDays = 0) => {
      const d = new Date(today.getTime() + plusDays * 86400_000);
      return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00:00-04:00`;
    };

    // Bookings: public event today on Dome; PRIVATE rental today on Dome;
    // public program next week on Dome; public event today on Fieldhouse (out of scope).
    const pub = await createBooking({ facilityId: idOf('Dome Court 1'), startsAt: at(18), endsAt: at(20), source: 'event', title: 'Public Showcase', actorClerkId: 'system:verify' });
    const priv = await createBooking({ facilityId: idOf('Dome Court 2'), startsAt: at(18), endsAt: at(20), source: 'rental', title: 'Private Rental', actorClerkId: 'system:verify' });
    const next = await createBooking({ facilityId: idOf('Dome Court 3'), startsAt: at(18, 7), endsAt: at(20, 7), source: 'program', title: 'Next Week Program', actorClerkId: 'system:verify' });
    const fh = await createBooking({ facilityId: fieldhouse, startsAt: at(18), endsAt: at(20), source: 'event', title: 'Fieldhouse Event', actorClerkId: 'system:verify' });
    madeBookings.push(pub.booking.id, priv.booking.id, next.booking.id, fh.booking.id);

    // Template + display scoped to the Dome
    const template = await upsertTemplate(
      { name: `Verify Template ${Date.now()}`, media_mode: 'slideshow', media_urls: ['https://example.com/a.jpg'], slide_seconds: 5 },
      'system:verify',
    );
    templateId = template.id;
    const display = await createDisplay({ name: 'Verify TV', templateId, facilityIds: [dome] }, 'system:verify');
    displayId = display.id;
    record('template + display created', display.token.length >= 24, `token length ${display.token.length}`);

    // 1. content: public Dome bookings only - private hidden, Fieldhouse out of scope
    const content = (await getDisplayContent(display.token))!;
    const todayTitles = content.todaysBookings.map((b) => b.title);
    record(
      'public-only + facility scope',
      todayTitles.includes('Public Showcase') && !todayTitles.includes('Private Rental') && !todayTitles.includes('Fieldhouse Event'),
      todayTitles.join(', ') || '(none today)',
    );

    // 2. today vs upcoming split
    record(
      'today/upcoming split (4 weeks)',
      content.upcoming.some((b) => b.title === 'Next Week Program') && !content.todaysBookings.some((b) => b.title === 'Next Week Program'),
      `upcoming: ${content.upcoming.map((b) => b.title).join(', ')}`,
    );

    // 3. UNAUTHENTICATED HTTP fetch of the token URL (the actual TV path)
    const res = await fetch(`http://localhost:3101/display/${display.token}`, { cache: 'no-store' });
    const html = await res.text();
    record(
      'token URL public + renders public booking only',
      res.status === 200 && html.includes('Public Showcase') && !html.includes('Private Rental'),
      `HTTP ${res.status}`,
    );

    // 4. unknown token -> configured-not-found page, still 200 (no auth leak)
    const bad = await fetch('http://localhost:3101/display/not-a-real-token', { cache: 'no-store' });
    const badHtml = await bad.text();
    record('unknown token shows not-configured', bad.status === 200 && badHtml.includes('not configured'), `HTTP ${bad.status}`);
  } catch (err) {
    record('UNEXPECTED ERROR', false, err instanceof Error ? err.message : String(err));
  } finally {
    if (madeBookings.length) await db.from('bookings').delete().in('id', madeBookings);
    if (displayId) await db.from('displays').delete().eq('id', displayId);
    if (templateId) await db.from('display_templates').delete().eq('id', templateId);
    record('cleanup', true, 'bookings, display, template removed');
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ allOk, steps }, { status: allOk ? 200 : 500 });
}
