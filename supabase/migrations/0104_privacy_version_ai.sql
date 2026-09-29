-- 0104: a new Privacy Notice version for the AI helpers (0103): Anthropic is
-- a new processor for the helpers a user turns on. Signed-in users are asked
-- to accept it (LegalGate) and earlier sign-ups are emailed once about it.
-- The Terms of Use are unchanged.
-- LOCKSTEP: LEGAL_VERSIONS in supabase/functions/_shared/legal.ts.

create or replace function public.current_legal_versions()
returns jsonb language sql immutable
set search_path = public, pg_temp as $$
  select jsonb_build_object('privacy', '2026-09-29', 'terms', '2026-09-23')
$$;
revoke execute on function public.current_legal_versions() from public, anon;
grant execute on function public.current_legal_versions() to authenticated;
