/**
 * Block schema tests (Module 23 §5): validator, sanitiser, slugs, reserved
 * paths, public filtering. Run: npm run test:blocks
 */
import { validateBlocks, sanitizeHtml, publicBlocks, slugify, RESERVED_SLUGS, newBlock, blockSummary } from './__compiled__/blocks.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

// --- validator -----------------------------------------------------------------
{
  const r = validateBlocks('nope');
  ok('non-array rejected', r.issues.length === 1 && r.blocks.length === 0);
}
{
  const r = validateBlocks([{ id: 'a', type: 'nope', props: {} }]);
  ok('unknown type rejected', r.issues.some((i) => /Unknown block type/.test(i.message)));
}
{
  const r = validateBlocks([{ id: 'h', type: 'hero', props: { heading: 'Hi.', ctaHref: 'javascript:alert(1)' } }]);
  ok('javascript: link rejected', r.issues.length > 0, JSON.stringify(r.issues));
}
{
  const r = validateBlocks([{ id: 'e', type: 'embed', props: { url: 'https://evil.example/x' } }]);
  ok('non-allowlisted embed rejected', r.issues.length > 0);
  const g = validateBlocks([{ id: 'e', type: 'embed', props: { url: 'https://www.youtube.com/embed/abc' } }]);
  ok('youtube embed accepted', g.issues.length === 0, JSON.stringify(g.issues));
}
{
  const r = validateBlocks([{ id: 't', type: 'rich_text', props: { html: '<p>Hi <script>x()</script><b onclick="y()">bold</b></p>' } }]);
  const html = r.blocks[0]?.props.html ?? '';
  ok('script stripped from rich text', !/script/.test(html) && /<b>bold<\/b>/.test(html), html);
}
{
  const r = validateBlocks([{ id: 'c', type: 'columns', props: { columns: [[{ id: 'x', type: 'rich_text', props: { html: '<p>a</p>' } }], [{ id: 'y', type: 'bogus', props: {} }]] } }]);
  ok('nested column blocks validated', r.issues.length === 1);
}
{
  const r = validateBlocks([newBlock('faq'), newBlock('why_band'), newBlock('big_buttons'), newBlock('location_list')]);
  ok('defaults validate clean', r.issues.length === 0, JSON.stringify(r.issues));
  ok('ids kept', r.blocks.every((b) => typeof b.id === 'string' && b.id.length > 0));
}

// --- sanitiser -------------------------------------------------------------------
ok('allowed tags kept', sanitizeHtml('<p>Hi <a href="/x">link</a></p>') === '<p>Hi <a href="/x">link</a></p>', sanitizeHtml('<p>Hi <a href="/x">link</a></p>'));
ok('style attribute dropped', !/style=/.test(sanitizeHtml('<p style="color:red">x</p>')));
ok('iframe dropped', !/iframe/.test(sanitizeHtml('<iframe src="https://x"></iframe><p>ok</p>')));
ok('external link gets rel', /rel="noopener/.test(sanitizeHtml('<a href="https://example.com">x</a>')));
ok('data: href dropped', !/data:/.test(sanitizeHtml('<a href="data:text/html,hi">x</a>')));

// --- slugs ------------------------------------------------------------------------
ok('slugify basic', slugify('Toronto Midtown!') === 'toronto-midtown');
ok('slugify keeps nested path', slugify('/orangeville/Basketball/') === 'orangeville/basketball');
ok('slugify accents', slugify('Café Été') === 'cafe-ete');
ok('reserved: standings', RESERVED_SLUGS.has('standings'));
ok('reserved: sitemap', RESERVED_SLUGS.has('sitemap.xml'));

// --- public filtering ---------------------------------------------------------------
{
  const pub = publicBlocks([{ id: '1', type: 'claude', props: { prompt: 'x' } }, { id: '2', type: 'rich_text', props: { html: '<p>a</p>' }, hidden: true }, { id: '3', type: 'divider', props: {} }]);
  ok('claude and hidden blocks never render', pub.length === 1 && pub[0].id === '3');
}
ok('summary names the block', typeof blockSummary(newBlock('hero')) === 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
