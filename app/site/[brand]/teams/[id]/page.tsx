import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@ai/foundation/supabase';

export const dynamic = 'force-dynamic';

/** /teams/<id> resolves to the team's division page, rosters tab. */
export default async function TeamRedirect({ params }: { params: { brand: string; id: string } }) {
  const { data } = await supabaseAdmin().from('teams').select('division_id').eq('id', Number(params.id)).maybeSingle();
  if (!data) notFound();
  redirect(`/standings/${data.division_id}#rosters`);
}
