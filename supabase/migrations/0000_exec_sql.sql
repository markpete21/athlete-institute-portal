-- ============================================================================
-- 0000 - exec_sql bootstrap (paste ONCE; enables hands-free migrations)
-- Paste into the Supabase SQL Editor and RUN. After this, Claude applies all
-- future migrations via scripts/run-migration.mjs (no more manual pasting).
--
-- WHAT IT IS: a helper that runs a SQL string, callable ONLY by the
-- service_role key (already in .env.local, already has full data power). This
-- adds schema changes to what that key can do; it is NOT exposed to anon/
-- authenticated/public. Revoked from everyone else below.
-- ============================================================================

create or replace function public.exec_sql(query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute query;
end;
$$;

-- Lock it down: only the service_role key may call it.
revoke all on function public.exec_sql(text) from public;
revoke all on function public.exec_sql(text) from anon;
revoke all on function public.exec_sql(text) from authenticated;
grant execute on function public.exec_sql(text) to service_role;

-- Refresh PostgREST's schema cache so the RPC endpoint appears immediately.
notify pgrst, 'reload schema';
