-- 0089: status_snapshot() — the operational signals the public status page
-- (status/, a Cloudflare Worker) reads every 10 minutes.
--
-- The Worker calls it through PostgREST with the anon key, so a successful
-- call is itself the "database is up" signal; the payload adds the few things
-- only the database can see:
--   db_time               now(), so the caller can tell a live answer from a cache
--   fx_latest_date        the newest ECB rate date in the cache (fx_rates, 0062)
--   email_queue_overdue   privacy_email_queue rows due more than 15 minutes ago
--                         (the sweep runs every 5 and leases a claim for 10, so
--                         a row this late means the sweep isn't sending)
--   email_queue_retrying  rows waiting to retry after a failed send (attempts > 0)
-- Both counts are capped at 100: the page only needs "none / some / many".
--
-- Why anon may call it (CLAUDE.md #5, deliberately callable): the status page
-- is public and holds no Budgeer account, and everything returned is an
-- aggregate — a timestamp, a date and two capped counts. No ids, no emails,
-- nothing per user. It writes nothing and each read is an index lookup
-- (fx_rates' primary key; the partial due_at index on the queue), so a caller
-- can't make it expensive. authenticated has no need for it and gets no grant.
create or replace function public.status_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'db_time', now(),
    'fx_latest_date', (select max(r.rate_date) from public.fx_rates r),
    'email_queue_overdue', (select count(*) from (
        select 1 from public.privacy_email_queue q
         where q.due_at < now() - interval '15 minutes'
         limit 100) o),
    'email_queue_retrying', (select count(*) from (
        select 1 from public.privacy_email_queue q
         where q.due_at is not null and q.attempts > 0
         limit 100) r))
$$;

revoke execute on function public.status_snapshot() from public, anon, authenticated;
grant execute on function public.status_snapshot() to anon;
