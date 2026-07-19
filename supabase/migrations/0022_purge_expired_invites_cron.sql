-- Housekeeping: delete long-expired invite rows so group_invites doesn't grow
-- unbounded. Expired invites already stop working everywhere (every read gates
-- on expires_at > now()); this just reclaims the rows.
--
-- 7-day grace after expiry: notifications.invite_id is ON DELETE CASCADE, so a
-- targeted email invite's "you were invited" notification is removed with it.
-- Waiting a week past expiry means those notifications don't vanish the moment
-- a link lapses (share-link invites carry no notification, so most rows here
-- are cascade-free anyway).

create or replace function public.purge_expired_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare deleted int;
begin
  delete from public.group_invites
   where expires_at is not null
     and expires_at < now() - interval '7 days';
  get diagnostics deleted = row_count;
  return deleted;
end $$;

-- cron/postgres only — never over the API.
revoke execute on function public.purge_expired_invites() from anon, authenticated, public;

-- Daily at 03:30 UTC (idempotent: unschedule any prior job first).
select cron.unschedule('purge-expired-invites')
  where exists (select 1 from cron.job where jobname = 'purge-expired-invites');
select cron.schedule('purge-expired-invites', '30 3 * * *',
  $cron$select public.purge_expired_invites();$cron$);
