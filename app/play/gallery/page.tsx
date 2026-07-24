import Link from 'next/link';
import { getPortalSession } from '@/lib/auth';
import { galleriesForFamily } from '@/lib/gallery/gallery';

export const dynamic = 'force-dynamic';

/** Family gallery list (Module 17) - auto-populated from enrollments. */
export default async function GalleryListPage() {
  const session = await getPortalSession();
  const galleries = session.familyId ? await galleriesForFamily(session.familyId) : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <p className="label text-[11px]">Your galleries</p>
        <h1 className="text-4xl">Photos &amp; video<span style={{ color: 'var(--accent)' }}>.</span></h1>
        <p className="text-body text-sm">Galleries from your programs appear here automatically.</p>
      </header>

      {!session.userId ? (
        <p className="text-body">Please <Link href="/sign-in" className="underline">sign in</Link> to see your galleries.</p>
      ) : galleries.length === 0 ? (
        <p className="text-body">No galleries yet — they appear when staff share photos from your programs.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {galleries.map((g) => (
            <Link key={g.id} href={`/gallery/${g.id}`} className="card flex items-center justify-between p-4 hover:border-[var(--accent)]">
              <span className="flex flex-col"><span className="font-bold text-ink">{g.title}</span><span className="text-xs text-silver">{g.programName}</span></span>
              <span className="tag">{g.mediaCount}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
