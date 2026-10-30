import { notFound, redirect } from 'next/navigation';
import { getSite } from '@/lib/site/sites';
import { getPortalSession } from '@/lib/auth';
import { siteRoleFor, canManage } from '@/lib/site/scopes';
import { THEMES } from '@ai/foundation';
import { saveSettingsAction } from '../../actions';
import { SubmitButton } from '@/app/admin/brands/SubmitButton';
import { DomainsPanel } from './DomainsPanel';
import { FooterEditor } from './FooterEditor';

export const dynamic = 'force-dynamic';

/** Settings (Module 23 §2.9): domains, contact, links, Ask, coming-soon copy, footer, theme. Admins only. */
export default async function SettingsPage({ params }: { params: { brand: string } }) {
  const brand = params.brand;
  const role = await siteRoleFor(await getPortalSession(), brand);
  if (!role || !canManage(role)) redirect(`/sites/${brand}`);
  const site = await getSite(brand);
  if (!site) notFound();
  const F = ({ id, label, name, value, type = 'text', hint, wide }: { id: string; label: string; name: string; value?: string; type?: string; hint?: string; wide?: boolean }) => (
    <div className={`flex flex-col ${wide ? 'sm:col-span-2' : ''}`}><label className="field-label" htmlFor={id}>{label}</label><input id={id} name={name} type={type} defaultValue={value ?? ''} className="input text-sm" />{hint && <span className="mt-1 text-xs text-silver">{hint}</span>}</div>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <DomainsPanel brand={brand} hostnames={site.hostnames} primaryHost={site.primaryHost} status={site.status} />

      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>Contact and legal</h2><span className="card-head-lbl">Footer, contact page, privacy policy, JSON-LD</span></div>
        <form action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="contact" />
          <F id="st-name" label="Site name" name="name" value={site.name} />
          <F id="st-legal" label="Legal name" name="legalName" value={site.contact.legal_name} hint="e.g. Athlete Institute, Ltd." />
          <F id="st-email" label="Main contact email" name="email" type="email" value={site.contact.email} />
          <F id="st-phone" label="Phone" name="phone" value={site.contact.phone} />
          <F id="st-addr" label="Mailing address" name="address" value={site.contact.address} wide />
          <F id="st-map" label="Google Maps link" name="mapUrl" value={site.contact.map_url} wide />
          <div className="sm:col-span-2"><SubmitButton className="btn-gold btn-sm">Save contact</SubmitButton></div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>Links and social</h2><span className="card-head-lbl">Header account chip, footer, Watch and Shop</span></div>
        <form action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="links" />
          <F id="st-play" label="Play. App URL" name="playUrl" value={site.links.play_url} hint="Where Register and Sign in go" />
          <F id="st-watch" label="Watch (live stream) URL" name="watchUrl" value={site.links.watch_url} />
          <F id="st-tix" label="Tickets URL" name="ticketsUrl" value={site.links.tickets_url} />
          <F id="st-gear" label="Shop / gear URL" name="gearUrl" value={site.links.gear_url} />
          <F id="st-ig" label="Instagram" name="instagram" value={site.social.instagram} />
          <F id="st-fb" label="Facebook" name="facebook" value={site.social.facebook} />
          <F id="st-yt" label="YouTube" name="youtube" value={site.social.youtube} />
          <F id="st-tt" label="TikTok" name="tiktok" value={site.social.tiktok} />
          <div className="sm:col-span-2"><SubmitButton className="btn-gold btn-sm">Save links</SubmitButton></div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>Ask {site.name.replace(/\s+Sport$/i, '')}</h2><span className="card-head-lbl">Answers only from published pages</span></div>
        <form action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="ask" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="askEnabled" defaultChecked={site.settings.ask_enabled !== false} /> Show the Ask button on the site</label>
          <F id="st-askmail" label="Hand-off email" name="askEmail" type="email" value={site.settings.ask_handoff_email} hint="Used when Ask can't answer" />
          <F id="st-askphone" label="Hand-off phone" name="askPhone" value={site.settings.ask_handoff_phone} />
          <div className="sm:col-span-2"><SubmitButton className="btn-gold btn-sm">Save Ask</SubmitButton></div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>Password protection</h2><span className={`card-head-lbl ${site.settings.gate_password ? 'text-[#8a6d1f]' : ''}`}>{site.settings.gate_password ? 'On · visitors need the password' : 'Off'}</span></div>
        <p className="text-body text-sm">Keep the live domain private while you finish. Visitors see a password page; you and other site members never do. Search engines are told to stay out while it&apos;s on.</p>
        <form action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="gate" />
          <F id="st-gate-pw" label={site.settings.gate_password ? 'New password (blank keeps the current one)' : 'Password'} name="password" type="text" hint="Share it with the people who should see the site. Changing it signs everyone out." />
          <F id="st-gate-msg" label="Message on the password page" name="message" value={site.settings.gate_message} />
          <div className="flex gap-2 sm:col-span-2"><SubmitButton className="btn-gold btn-sm">{site.settings.gate_password ? 'Update' : 'Turn on'}</SubmitButton>
            {site.settings.gate_password && <button type="submit" name="clear" value="on" className="btn-ghost btn-sm">Turn off</button>}</div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="card-head"><h2>Coming-soon page</h2><span className="card-head-lbl">Shown while the site is not live</span></div>
        <form action={saveSettingsAction} className="grid gap-3">
          <input type="hidden" name="brand" value={brand} /><input type="hidden" name="section" value="coming_soon" />
          <F id="st-cs-h" label="Headline" name="headline" value={site.comingSoon.headline} />
          <div className="flex flex-col"><label className="field-label" htmlFor="st-cs-b">Line</label><textarea id="st-cs-b" name="body" rows={3} defaultValue={site.comingSoon.body ?? ''} className="input text-sm" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="capture" defaultChecked={site.comingSoon.show_email_capture !== false} /> Collect emails on the coming-soon page</label>
          <div><SubmitButton className="btn-gold btn-sm">Save coming soon</SubmitButton></div>
        </form>
      </section>

      <section className="card flex flex-col gap-4 p-5 lg:col-span-2">
        <div className="card-head"><h2>Footer</h2><span className="card-head-lbl">Columns, tagline, partner logos</span></div>
        <FooterEditor brand={brand} columns={site.footer.columns ?? []} tagline={site.footer.tagline ?? ''} legalText={site.footer.legal_text ?? ''} partners={site.footer.partners !== false} />
      </section>

      <section className="card flex flex-col gap-2 p-5 lg:col-span-2">
        <div className="card-head"><h2>Theme</h2><span className="card-head-lbl">{THEMES[site.themeKey]?.name ?? site.themeKey}</span></div>
        <p className="text-body text-sm">The theme pack sets type, colours and component styling for the whole site. Changing it is a design decision made with the brand owner, so it is set when the site is created.</p>
      </section>
    </div>
  );
}
