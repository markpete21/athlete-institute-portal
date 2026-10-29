import type { BrandSite } from '@/lib/site/sites';

/**
 * Brand-site footer (ALL CAN §3): black, the horizontal logo and tagline on
 * the left, the saved columns on the right, and the small partner logos along
 * the bottom (equal visual area). The shared "Athlete Institute" column with
 * Watch / Tickets / Shop is part of the saved columns so staff can reorder it.
 */
export default function SiteFooter({ site, logoUrl, partners }: { site: BrandSite; logoUrl: string | null; partners: { name: string; logoUrl: string; factor: number }[] }) {
  const cols = site.footer.columns ?? [];
  return (
    <footer className="ftr on-dark">
      <div className="wrap">
        <div className="grid" style={{ rowGap: 40 }}>
          <div className="left mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt={site.name} /> : <b style={{ fontSize: 28 }}>{site.name}</b>}
            {site.footer.tagline && <p className="muted" style={{ marginTop: 18, fontSize: 15 }}>{site.footer.tagline}</p>}
          </div>
          <div className="right ftr-nav">
            {/* Two grid cells: the first column alone, every other column stacked in the second. */}
            {cols.length > 0 && <Col c={cols[0]} />}
            <div>{cols.slice(1).map((c, i) => <Col key={i} c={c} stacked={i > 0} />)}</div>
          </div>
        </div>
        {site.footer.partners !== false && partners.length > 0 ? (
          <ul className="legal ftr-partners" aria-label="Partners">
            {partners.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <li key={p.name}><img src={p.logoUrl} alt={p.name} style={{ ['--f' as string]: p.factor }} /></li>
            ))}
          </ul>
        ) : (
          <div className="legal"><span>© {new Date().getFullYear()} {site.contact.legal_name ?? site.name}</span>{site.footer.legal_text && <span>{site.footer.legal_text}</span>}</div>
        )}
      </div>
    </footer>
  );
}

function Col({ c, stacked }: { c: { title: string; items: { label: string; href: string; new_tab?: boolean }[] }; stacked?: boolean }) {
  return (
    <div>
      <h4 style={stacked ? { marginTop: 18 } : undefined}>{c.title}</h4>
      {c.items.map((it, j) => <a key={j} href={it.href} target={it.new_tab ? '_blank' : undefined} rel={it.new_tab ? 'noopener' : undefined}>{it.label}</a>)}
    </div>
  );
}
