/**
 * Availability engine tests (Module 2 Stage 2) — the spec's worked cases.
 * Run: npm run test:availability
 */
import { findConflicts, checkOperatingHours, effectiveHours, effectiveHoursOn, occupiedInterval, intervalsOverlap, torontoWeekday, torontoDate, checkClosures } from './__compiled__/availability.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ` — ${detail}`}`);
  cond ? pass++ : fail++;
};

// Mini-tree mirroring the real one:
// Dome(1) → Court1(2) → BasketA(3), BasketB(4)
//         → Court2(5) → BasketC(6), BasketD(7)
// Fieldhouse(8) (sibling of Dome under AI(0))
const tree = [
  { id: 0, parent_id: null, name: 'AI', label: null, sort_order: 1, bookable: false },
  { id: 1, parent_id: 0, name: 'Dome', label: null, sort_order: 1, bookable: true },
  { id: 2, parent_id: 1, name: 'Court 1', label: null, sort_order: 1, bookable: true },
  { id: 3, parent_id: 2, name: 'Basket A', label: null, sort_order: 1, bookable: true },
  { id: 4, parent_id: 2, name: 'Basket B', label: null, sort_order: 2, bookable: true },
  { id: 5, parent_id: 1, name: 'Court 2', label: null, sort_order: 2, bookable: true },
  { id: 6, parent_id: 5, name: 'Basket C', label: null, sort_order: 1, bookable: true },
  { id: 7, parent_id: 5, name: 'Basket D', label: null, sort_order: 2, bookable: true },
  { id: 8, parent_id: 0, name: 'Fieldhouse', label: null, sort_order: 2, bookable: true },
];

const at = (h, m = 0) => `2026-08-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`; // EDT
const slot = (facility_id, sh, eh, extra = {}) => ({ facility_id, starts_at: at(sh), ends_at: at(eh), ...extra });
const bk = (id, facility_id, sh, eh, extra = {}) => ({ id, facility_id, starts_at: at(sh), ends_at: at(eh), ...extra });

// 1. same-node conflict
ok('same-node overlap conflicts',
  findConflicts(tree, [bk(1, 2, 18, 20)], slot(2, 19, 21)).length === 1);

// 2. back-to-back is NOT a conflict (half-open)
ok('back-to-back same node is fine',
  findConflicts(tree, [bk(1, 2, 18, 20)], slot(2, 20, 22)).length === 0);

// 3. ancestor blocks child: Dome booked → Court 2 unavailable
ok('ancestor booking blocks child',
  findConflicts(tree, [bk(1, 1, 18, 20)], slot(5, 18, 19)).some((c) => c.relation === 'ancestor'));

// 4. descendant blocks parent: Basket A booked → Court 1 unavailable as a whole
ok('descendant booking blocks parent',
  findConflicts(tree, [bk(1, 3, 18, 20)], slot(2, 18, 20)).some((c) => c.relation === 'descendant'));

// 5. sibling independence: Basket A booked → Basket B free
ok('sibling stays independently bookable',
  findConflicts(tree, [bk(1, 3, 18, 20)], slot(4, 18, 20)).length === 0);

// 6. THE CRITICAL CASE: Basket A + Basket B booked separately → Court 1 shows
//    BOTH as descendant conflicts (court fully occupied), Court 2 untouched,
//    and Dome (grandparent) is also blocked by both.
{
  const both = [bk(1, 3, 18, 20, { title: 'Shooting A' }), bk(2, 4, 18, 20, { title: 'Shooting B' })];
  const court1 = findConflicts(tree, both, slot(2, 18, 20));
  const court2 = findConflicts(tree, both, slot(5, 18, 20));
  const dome = findConflicts(tree, both, slot(1, 18, 20));
  ok('two baskets → court fully occupied (both conflicts surface)',
    court1.length === 2 && court1.every((c) => c.relation === 'descendant'));
  ok('two baskets → sibling court unaffected', court2.length === 0);
  ok('two baskets → grandparent (Dome) also occupied', dome.length === 2);
}

// 7. different facility subtree never conflicts
ok('cross-subtree independence (Fieldhouse vs Dome)',
  findConflicts(tree, [bk(1, 1, 18, 20)], slot(8, 18, 20)).length === 0);

// 8. buffers: 15-min cleanup makes back-to-back collide; buffer-on-candidate too
ok('cleanup buffer causes adjacency conflict',
  findConflicts(tree, [bk(1, 2, 18, 20, { cleanup_minutes: 15 })], slot(2, 20, 21)).length === 1);
ok('setup buffer on candidate causes adjacency conflict',
  findConflicts(tree, [bk(1, 2, 18, 20)], slot(2, 20, 21, { setup_minutes: 15 })).length === 1);
ok('no buffers → adjacency clean',
  findConflicts(tree, [bk(1, 2, 18, 20)], slot(2, 20, 21)).length === 0);

// 9. tentative quotes hold slots exactly like confirmed
ok('tentative quote holds the slot',
  findConflicts(tree, [bk(1, 2, 18, 20, { status: 'tentative' })], slot(2, 18, 19)).length === 1);

// 10. ignoreBookingId (editing yourself)
ok('editing a booking ignores itself',
  findConflicts(tree, [bk(7, 2, 18, 20)], slot(2, 18, 20, { ignoreBookingId: 7 })).length === 0);

// 11. occupiedInterval math
{
  const o = occupiedInterval({ starts_at: at(18), ends_at: at(20), setup_minutes: 30, cleanup_minutes: 15 });
  ok('occupied interval widens by buffers',
    o.endMs - o.startMs === (2 * 60 + 45) * 60_000);
  ok('intervalsOverlap half-open edges', !intervalsOverlap(0, 10, 10, 20) && intervalsOverlap(0, 11, 10, 20));
}

// 12. operating hours: default 08:00–23:00 Toronto
ok('7am start warns', checkOperatingHours(tree, slot(2, 7, 9)) !== null);
ok('8am–11pm exactly is fine', checkOperatingHours(tree, { facility_id: 2, starts_at: at(8), ends_at: at(23) }) === null);
ok('crossing midnight warns', checkOperatingHours(tree, { facility_id: 2, starts_at: at(22), ends_at: '2026-08-11T01:00:00-04:00' }) !== null);

// 13. per-facility override + inheritance (Dome opens 06:00 → its baskets too)
{
  const t2 = tree.map((n) => (n.id === 1 ? { ...n, hours_open: '06:00', hours_close: '23:30' } : n));
  ok('facility hours override honored', checkOperatingHours(t2, slot(1, 7, 9)) === null);
  ok('override inherits to descendants', checkOperatingHours(t2, slot(3, 6, 8)) === null);
  ok('sibling subtree keeps default', checkOperatingHours(t2, slot(8, 7, 9)) !== null);
  ok('effectiveHours resolution', JSON.stringify(effectiveHours(t2, 3)) === JSON.stringify({ open: '06:00', close: '23:30' }));
}

// 14. weekday windows — the real Athlete Institute schedule
// 2026-08-10 is a Monday (weekday 1); 2026-08-15 is the Saturday that week.
{
  ok('torontoWeekday reads Toronto local day', torontoWeekday(at(12)) === 1);
  ok('torontoDate reads Toronto local date', torontoDate(at(12)) === '2026-08-10');
  // A 00:30 UTC instant is still the previous evening in Toronto.
  ok('torontoDate respects the offset', torontoDate('2026-08-11T02:30:00Z') === '2026-08-10');

  const AI_WINDOWS = [
    { weekday: 0, open: '08:00', close: '22:00' },
    { weekday: 1, open: '09:00', close: '22:00' },
    { weekday: 2, open: '09:00', close: '22:00' },
    { weekday: 3, open: '09:00', close: '22:00' },
    { weekday: 4, open: '09:00', close: '22:00' },
    { weekday: 5, open: '09:00', close: '22:00' },
    { weekday: 6, open: '08:00', close: '22:00' },
  ];
  const t3 = tree.map((n) => (n.id === 1 ? { ...n, hours_windows: AI_WINDOWS } : n));
  const sat = (h) => `2026-08-15T${String(h).padStart(2, '0')}:00:00-04:00`;

  ok('Monday 08:00 warns (weeknights open at 09:00)', checkOperatingHours(t3, slot(1, 8, 10)) !== null);
  ok('Monday 09:00 is fine', checkOperatingHours(t3, slot(1, 9, 11)) === null);
  ok('Saturday 08:00 is fine (weekends open at 08:00)',
    checkOperatingHours(t3, { facility_id: 1, starts_at: sat(8), ends_at: sat(10) }) === null);
  ok('Monday 22:30 end warns', checkOperatingHours(t3, { facility_id: 1, starts_at: at(21), ends_at: at(22, 30) }) !== null);
  ok('weekday windows inherit to descendants', checkOperatingHours(t3, slot(3, 8, 10)) !== null);
  ok('sibling subtree still on the default', checkOperatingHours(t3, slot(8, 8, 10)) === null);

  // A node that lists windows is closed on the weekdays it omits.
  const weeknightsOnly = tree.map((n) =>
    n.id === 1 ? { ...n, hours_windows: [{ weekday: 1, open: '17:00', close: '21:00' }] } : n);
  const closedSat = checkOperatingHours(weeknightsOnly, { facility_id: 1, starts_at: sat(18), ends_at: sat(20) });
  ok('unlisted weekday reads as closed', closedSat !== null && /Closed on Saturdays/.test(closedSat.message));
  ok('closed day reports null open/close', closedSat.open === null && closedSat.close === null);
  ok('listed weekday inside the window is fine',
    checkOperatingHours(weeknightsOnly, { facility_id: 1, starts_at: at(17), ends_at: at(21) }) === null);

  // Nearest definition wins outright — no merging with an ancestor's schedule.
  const childOverride = t3.map((n) =>
    n.id === 3 ? { ...n, hours_windows: [{ weekday: 1, open: '06:00', close: '23:00' }] } : n);
  ok('child window overrides the ancestor', checkOperatingHours(childOverride, slot(3, 6, 8)) === null);
  ok('ancestor still governs its other descendants', checkOperatingHours(childOverride, slot(2, 6, 8)) !== null);

  ok('effectiveHoursOn returns the weekday window',
    JSON.stringify(effectiveHoursOn(t3, 3, 6)) === JSON.stringify({ closed: false, open: '08:00', close: '22:00' }));
  ok('effectiveHoursOn falls back to the default',
    JSON.stringify(effectiveHoursOn(tree, 8, 1)) === JSON.stringify({ closed: false, open: '08:00', close: '23:00' }));
  ok('legacy single window applies every weekday', (() => {
    const legacy = tree.map((n) => (n.id === 1 ? { ...n, hours_open: '06:00', hours_close: '23:30' } : n));
    return effectiveHoursOn(legacy, 1, 0).open === '06:00' && effectiveHoursOn(legacy, 1, 3).open === '06:00';
  })());
  ok('windows win over legacy columns on the same node', (() => {
    const both = tree.map((n) =>
      n.id === 1 ? { ...n, hours_open: '06:00', hours_close: '23:30', hours_windows: AI_WINDOWS } : n);
    return effectiveHoursOn(both, 1, 1).open === '09:00';
  })());
}

// 15. seasonal closures (outdoor facilities in winter) — advisory, cascading
{
  const winter = { id: 1, facility_id: 1, starts_on: '2026-11-01', ends_on: '2027-04-15', reason: 'Winter' };
  ok('booking inside a closure warns', checkClosures(tree, [winter], {
    facility_id: 1, starts_at: '2026-12-05T18:00:00-05:00', ends_at: '2026-12-05T20:00:00-05:00',
  }).length === 1);
  ok('booking outside a closure is clean', checkClosures(tree, [winter], slot(1, 18, 20)).length === 0);

  const inherited = checkClosures(tree, [winter], {
    facility_id: 3, starts_at: '2026-12-05T18:00:00-05:00', ends_at: '2026-12-05T20:00:00-05:00',
  });
  ok('closure cascades to descendants', inherited.length === 1 && inherited[0].inherited === true);
  ok('closure does not leak to a sibling subtree', checkClosures(tree, [winter], {
    facility_id: 8, starts_at: '2026-12-05T18:00:00-05:00', ends_at: '2026-12-05T20:00:00-05:00',
  }).length === 0);

  // Inclusive bounds, and a booking that only clips the first day still warns.
  const oneDay = { id: 2, facility_id: 1, starts_on: '2026-12-25', ends_on: '2026-12-25', reason: 'Christmas' };
  ok('closure bounds are inclusive', checkClosures(tree, [oneDay], {
    facility_id: 1, starts_at: '2026-12-25T10:00:00-05:00', ends_at: '2026-12-25T12:00:00-05:00',
  }).length === 1);
  ok('day before the closure is clean', checkClosures(tree, [oneDay], {
    facility_id: 1, starts_at: '2026-12-24T10:00:00-05:00', ends_at: '2026-12-24T12:00:00-05:00',
  }).length === 0);
  ok('no closures configured means no warnings', checkClosures(tree, [], slot(1, 18, 20)).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
