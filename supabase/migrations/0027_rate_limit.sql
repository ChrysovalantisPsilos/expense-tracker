-- Lightweight per-caller rate limiting for the edge functions (invite emails,
-- report generation). Fixed-window counter keyed by "<fn>:<uid>".

create table if not exists public.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;  -- no policies: clients can't touch it

-- Returns true if the call is allowed (and records it), false if over the limit.
create or replace function public.rate_limit(p_key text, p_max int, p_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when public.rate_limits.window_start < now() - make_interval(secs => p_seconds)
                 then 1 else public.rate_limits.count + 1 end,
    window_start = case when public.rate_limits.window_start < now() - make_interval(secs => p_seconds)
                        then now() else public.rate_limits.window_start end
  returning * into cur;
  return cur.count <= p_max;
end $$;

revoke execute on function public.rate_limit(text, int, int) from anon, public;
grant execute on function public.rate_limit(text, int, int) to authenticated;
