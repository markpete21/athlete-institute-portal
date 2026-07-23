/**
 * Recurrence engine tests (Module 2 Stage 4) - incl. the DST crossings.
 * Run: npm run test:recurrence
 */
import { expandRecurrence, torontoInstant } from './__compiled__/recurrence.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ` - ${detail}`}`);
  cond ? pass++ : fail++;
};

// 1. every Tuesday 18:00-20:00, count 6
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [2] },
    startDate: '2026-09-01', startTime: '18:00', endTime: '20:00', count: 6,
  });
  ok('6 Tuesdays generated', occ.length === 6, `${occ.length}`);
  ok('first is Sep 1 (a Tuesday)', occ[0].date === '2026-09-01', occ[0].date);
  ok('7 days apart', occ[1].date === '2026-09-08' && occ[5].date === '2026-10-06', occ.map((o) => o.date).join(','));
}

// 2. until-date stop (inclusive)
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [2] },
    startDate: '2026-09-01', startTime: '18:00', endTime: '20:00', until: '2026-09-15',
  });
  ok('until-date inclusive', occ.length === 3 && occ[2].date === '2026-09-15', occ.map((o) => o.date).join(','));
}

// 3. multiple weekdays (Tue+Thu)
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [2, 4] },
    startDate: '2026-09-01', startTime: '18:00', endTime: '19:00', count: 4,
  });
  ok('Tue+Thu alternate', occ.map((o) => o.date).join(',') === '2026-09-01,2026-09-03,2026-09-08,2026-09-10', occ.map((o) => o.date).join(','));
}

// 4. biweekly interval
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [2], interval: 2 },
    startDate: '2026-09-01', startTime: '18:00', endTime: '19:00', count: 3,
  });
  ok('every-2-weeks skips alternates', occ.map((o) => o.date).join(',') === '2026-09-01,2026-09-15,2026-09-29', occ.map((o) => o.date).join(','));
}

// 5. DST FALL BACK: Nov 1 2026 ends EDT. Tuesdays Oct 27 (EDT, UTC-4) and
//    Nov 3 (EST, UTC-5) must BOTH be 18:00 Toronto wall time.
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [2] },
    startDate: '2026-10-27', startTime: '18:00', endTime: '20:00', count: 2,
  });
  ok('fall-back: EDT instant', occ[0].starts_at === '2026-10-27T22:00:00.000Z', occ[0].starts_at);
  ok('fall-back: EST instant (wall time preserved)', occ[1].starts_at === '2026-11-03T23:00:00.000Z', occ[1].starts_at);
}

// 6. DST SPRING FORWARD: Mar 8 2026. Sundays Mar 1 (EST) and Mar 8 (EDT).
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [0] },
    startDate: '2026-03-01', startTime: '09:00', endTime: '10:00', count: 2,
  });
  ok('spring-forward: EST instant', occ[0].starts_at === '2026-03-01T14:00:00.000Z', occ[0].starts_at);
  ok('spring-forward: EDT instant (wall time preserved)', occ[1].starts_at === '2026-03-08T13:00:00.000Z', occ[1].starts_at);
}

// 7. torontoInstant round-trips a plain time
ok('torontoInstant summer', torontoInstant('2026-07-23', '12:00') === '2026-07-23T16:00:00.000Z', torontoInstant('2026-07-23', '12:00'));
ok('torontoInstant winter', torontoInstant('2026-01-15', '12:00') === '2026-01-15T17:00:00.000Z', torontoInstant('2026-01-15', '12:00'));

// 8. validation
const throws = (name, fn) => { try { fn(); ok(name, false, 'no throw'); } catch { ok(name, true); } };
throws('until or count required', () => expandRecurrence({ pattern: { freq: 'weekly', byWeekday: [2] }, startDate: '2026-09-01', startTime: '18:00', endTime: '20:00' }));
throws('end after start required', () => expandRecurrence({ pattern: { freq: 'weekly', byWeekday: [2] }, startDate: '2026-09-01', startTime: '18:00', endTime: '17:00', count: 1 }));

// 9. safety valve
{
  const occ = expandRecurrence({
    pattern: { freq: 'weekly', byWeekday: [0, 1, 2, 3, 4, 5, 6] },
    startDate: '2026-01-01', startTime: '08:00', endTime: '09:00', until: '2030-01-01',
  });
  ok('maxOccurrences default caps runaway series', occ.length === 200, `${occ.length}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
