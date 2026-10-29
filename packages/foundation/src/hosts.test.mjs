/**
 * Brand-site host resolution tests (Module 23 §1.1). Run: npm run test:sites
 */
import { resolveHost, resolvePortalApp, siteOriginFor } from './__compiled__/hosts.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

ok('admin host', resolveHost('admin.athleteinstitute.ca').app === 'admin');
ok('play host', resolveHost('play.athleteinstitute.ca').app === 'play');
ok('compete host', resolveHost('compete.athleteinstitute.ca').app === 'compete');
ok('port stripped', resolveHost('Admin.Localhost:3000').app === 'admin');
ok('seeded brand host', JSON.stringify(resolveHost('allcansport.ca')) === JSON.stringify({ app: 'site', brandKey: 'all-can', wwwAlias: false }));
ok('www alias flagged', resolveHost('www.allcansport.ca').wwwAlias === true);
ok('manifest host wins', resolveHost('vanguardbasketball.ca', { siteHosts: { 'vanguardbasketball.ca': 'vanguard' } }).brandKey === 'vanguard');
ok('dev brand host', resolveHost('all-can.site.localhost:3000').brandKey === 'all-can');
ok('forced brand on preview', resolveHost('portal-abc.vercel.app', { forcedBrand: 'all-can' }).brandKey === 'all-can');
ok('forced brand ignored on real host', resolveHost('play.athleteinstitute.ca', { forcedBrand: 'all-can' }).app === 'play');
ok('forced brand rejects bad key', resolveHost('localhost', { forcedBrand: 'All Can!' }).app === 'play');
ok('unknown host defaults to play', resolvePortalApp('example.com') === 'play');
ok('site origin apex https', siteOriginFor('allcansport.ca', 'x') === 'https://allcansport.ca');
ok('site origin localhost http', siteOriginFor('all-can.site.localhost:3000', 'x') === 'http://all-can.site.localhost:3000');
ok('site origin fallback', siteOriginFor(null, 'https://fallback') === 'https://fallback');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
