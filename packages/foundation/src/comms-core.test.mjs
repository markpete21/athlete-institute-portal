/**
 * Communications engine tests (Module 13). Run: npm run test:comms
 */
import {
  abSplit, combineAudience, engagementFilter, extractMergeTags, pickAbWinner,
  renderBlocks, renderMergeTags, spamCheck,
} from './__compiled__/comms-core.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

// --- merge tags ------------------------------------------------------------
{
  ok('renders merge tags', renderMergeTags('Hi {{first_name}}, {{program_name}}!', { first_name: 'Jane', program_name: 'U10' }) === 'Hi Jane, U10!');
  ok('missing tag -> empty', renderMergeTags('Owe {{balance_owed}}', {}) === 'Owe ');
  ok('extracts tags', extractMergeTags('{{a}} {{b}} {{a}}').join() === 'a,b');
}

// --- combine audience (include/exclude, live) ------------------------------
{
  // program X + program Y minus anyone in Z, minus suppressed
  const out = combineAudience({ include: [[1, 2, 3], [3, 4, 5]], exclude: [[2, 5]], suppressed: [4] });
  ok('union of includes minus exclude minus suppressed', out.join() === '1,3', out.join());
  ok('dedupes across include sets', combineAudience({ include: [[1, 1, 2], [2, 3]] }).join() === '1,2,3');
  ok('order preserved by first appearance', combineAudience({ include: [[9, 8], [7]] }).join() === '9,8,7');
}

// --- A/B split + winner ----------------------------------------------------
{
  const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
  const { a, b, holdout } = abSplit(ids, 100);
  ok('100% split covers everyone, no holdout', a.length + b.length === 1000 && holdout.length === 0);
  ok('A/B roughly even', Math.abs(a.length - b.length) < 120, `${a.length}/${b.length}`);
  const { a: a2, b: b2, holdout: h2 } = abSplit(ids, 40);
  ok('partial split leaves a holdout', h2.length > 0 && a2.length + b2.length + h2.length === 1000, `test ${a2.length + b2.length}, hold ${h2.length}`);
  // deterministic
  ok('split is deterministic', abSplit([5, 6, 7]).a.join() === abSplit([5, 6, 7]).a.join());

  ok('winner by click rate', pickAbWinner({ sent: 100, opened: 50, clicked: 10 }, { sent: 100, opened: 60, clicked: 5 }) === 'A');
  ok('open rate breaks click tie', pickAbWinner({ sent: 100, opened: 50, clicked: 10 }, { sent: 100, opened: 60, clicked: 10 }) === 'B');
  ok('identical -> tie', pickAbWinner({ sent: 10, opened: 5, clicked: 1 }, { sent: 10, opened: 5, clicked: 1 }) === 'tie');
}

// --- engagement filter -----------------------------------------------------
{
  const lastOpen = new Map([[1, '2026-05-01'], [2, '2025-01-01']]);
  const lastSent = new Map([[1, '2026-06-01'], [2, '2026-06-01'], [3, '2026-06-01']]);
  const kept = engagementFilter({ ids: [1, 2, 3, 4], lastOpenById: lastOpen, lastSentById: lastSent, cutoffISO: '2026-01-01' });
  // 1 opened after cutoff -> keep; 2 opened before -> drop; 3 sent-never-opened -> drop; 4 never sent -> keep (new)
  ok('engagement filter keeps recent openers + brand-new', kept.join() === '1,4', kept.join());
}

// --- spam check ------------------------------------------------------------
{
  const clean = spamCheck({ subject: 'Your U10 schedule is ready', html: '<p>Hi, here is your schedule for the week. See you Tuesday.</p><a href="#">unsubscribe</a> 123 Main Street, Orangeville, ON', isMarketing: true });
  ok('clean marketing email -> no warnings', clean.length === 0, JSON.stringify(clean));

  const missing = spamCheck({ subject: 'FREE CASH WINNER!!!', html: '<img><img><img>', isMarketing: true });
  const codes = missing.map((w) => w.code);
  ok('flags ALL CAPS subject', codes.includes('all_caps_subject'));
  ok('flags trigger words', codes.includes('trigger_words'));
  ok('flags excess punctuation', codes.includes('excess_punctuation'));
  ok('flags missing unsubscribe', codes.includes('missing_unsubscribe'));
  ok('flags missing sender-id', codes.includes('missing_sender_id'));
  ok('flags image heavy', codes.includes('image_heavy'));

  const txn = spamCheck({ subject: 'Payment receipt', html: '<p>Thanks for your payment of $100. Your balance is now $0.</p>', isMarketing: false });
  ok('transactional email needs no unsubscribe/sender-id', !txn.some((w) => ['missing_unsubscribe', 'missing_sender_id'].includes(w.code)), JSON.stringify(txn));
}

// --- block rendering -------------------------------------------------------
{
  const html = renderBlocks([
    { type: 'header', title: '{{brand}}' },
    { type: 'text', text: 'Hi {{first_name}}' },
    { type: 'columns', columns: [[{ type: 'text', text: 'L' }], [{ type: 'text', text: 'R' }]] },
    { type: 'button', label: 'Pay {{balance_owed}}', url: 'https://x/{{token}}' },
  ], { brand: 'OP', first_name: 'Jane', balance_owed: '$50', token: 'abc' });
  ok('renders blocks with merge tags', html.includes('OP') && html.includes('Hi Jane') && html.includes('$50') && html.includes('https://x/abc'));
  ok('renders columns', html.includes('<td') && html.includes('>L<') && html.includes('>R<'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
