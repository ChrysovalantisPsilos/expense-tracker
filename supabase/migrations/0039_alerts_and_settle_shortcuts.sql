-- Proactive alerts + settle-up shortcuts.
--
-- 1. Budget threshold alerts: crossing 80% / 100% of a monthly category
--    budget inserts a notification — the notify_fanout trigger then delivers
--    push (and the bell) automatically.
-- 2. Weekly digest: Sunday-evening cron summarises the week's spending per
--    user into a notification (push + bell; not an email type).
-- 3. Nudges: a member can send a rate-limited "please settle up" reminder.
-- 4. Payment details on profiles (IBAN / Revolut tag) power "pay exact
--    amount" shortcuts in the settle modal; profiles join the realtime
--    publication so name/avatar/switch changes sync across devices.

-- ---------------------------------------------------------------------------
-- Payment details + live profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists payment_iban text,
  add column if not exists payment_revolut text;

alter table public.profiles replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Minor units -> display string, currency-aware (zero-decimal set matches
-- the frontend's currency.js).
create or replace function public.fmt_minor(p_amount bigint, p_currency text)
returns text language sql immutable as $$
  select case
    when p_currency in ('JPY', 'KRW', 'VND', 'CLP')
      then to_char(p_amount, 'FM999,999,999,990') || ' ' || p_currency
    else to_char(p_amount / 100.0, 'FM999,999,999,990.00') || ' ' || p_currency
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Budget threshold alerts (80% warning, 100% exceeded) on expense insert.
--    Converts to base via the captured exchange_rate, mirroring the app.
-- ---------------------------------------------------------------------------
create or replace function public.notify_budget_threshold()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  spent_after bigint;
  spent_before bigint;
  cat_name text;
begin
  if NEW.kind <> 'expense' or NEW.category_id is null then return NEW; end if;

  select * into b from public.budgets
   where user_id = NEW.user_id and category_id = NEW.category_id
     and period_start = date_trunc('month', NEW.spent_at)::date;
  if b is null or b.amount_minor <= 0 then return NEW; end if;

  select coalesce(sum(round(amount_minor * coalesce(exchange_rate, 1))), 0)
    into spent_after
    from public.transactions
   where user_id = NEW.user_id and category_id = NEW.category_id and kind = 'expense'
     and spent_at >= b.period_start
     and spent_at < (b.period_start + interval '1 month')::date;
  spent_before := spent_after - round(NEW.amount_minor * coalesce(NEW.exchange_rate, 1));

  select name into cat_name from public.categories where id = NEW.category_id;
  cat_name := coalesce(cat_name, 'A category');

  if spent_before < b.amount_minor and spent_after >= b.amount_minor then
    insert into public.notifications (user_id, type, title, body)
    values (NEW.user_id, 'budget', 'Budget exceeded',
      cat_name || ' passed its monthly budget: ' || public.fmt_minor(spent_after, b.currency)
      || ' of ' || public.fmt_minor(b.amount_minor, b.currency) || '.');
  elsif spent_before < round(b.amount_minor * 0.8)
    and spent_after >= round(b.amount_minor * 0.8) then
    insert into public.notifications (user_id, type, title, body)
    values (NEW.user_id, 'budget', 'Budget almost used',
      cat_name || ' is at ' || round(spent_after * 100.0 / b.amount_minor)
      || '% of its ' || public.fmt_minor(b.amount_minor, b.currency) || ' monthly budget.');
  end if;
  return NEW;
end $$;
revoke execute on function public.notify_budget_threshold() from anon, authenticated, public;

drop trigger if exists trg_notify_budget on public.transactions;
create trigger trg_notify_budget after insert on public.transactions
  for each row execute function public.notify_budget_threshold();

-- ---------------------------------------------------------------------------
-- 2) Weekly digest — Sundays 17:00 UTC, for users with spending this week.
-- ---------------------------------------------------------------------------
create or replace function public.send_weekly_digests()
returns integer language plpgsql security definer set search_path = public as $$
declare
  u record; total bigint; cnt int; top_name text; top_amt bigint; cur text; n int := 0;
begin
  for u in
    select distinct user_id from public.transactions
    where kind = 'expense' and spent_at >= current_date - 6
  loop
    select coalesce(base_currency, 'EUR') into cur from public.profiles where id = u.user_id;
    select coalesce(sum(round(amount_minor * coalesce(exchange_rate, 1))), 0), count(*)
      into total, cnt
      from public.transactions
     where user_id = u.user_id and kind = 'expense' and spent_at >= current_date - 6;
    select coalesce(c.name, 'Uncategorized'),
           sum(round(t.amount_minor * coalesce(t.exchange_rate, 1)))
      into top_name, top_amt
      from public.transactions t
      left join public.categories c on c.id = t.category_id
     where t.user_id = u.user_id and t.kind = 'expense' and t.spent_at >= current_date - 6
     group by 1 order by 2 desc limit 1;

    insert into public.notifications (user_id, type, title, body)
    values (u.user_id, 'digest', 'Your week in money',
      public.fmt_minor(total, cur) || ' across ' || cnt || ' expense' || case when cnt = 1 then '' else 's' end
      || ' this week · top: ' || top_name || ' (' || public.fmt_minor(top_amt, cur) || ').');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_weekly_digests() from anon, authenticated, public;

select cron.unschedule('weekly-digest')
  where exists (select 1 from cron.job where jobname = 'weekly-digest');
select cron.schedule('weekly-digest', '0 17 * * 0',
  $cron$select public.send_weekly_digests();$cron$);

-- ---------------------------------------------------------------------------
-- 3) Nudge a co-member to settle up (rate-limited to 2/day per pair).
-- ---------------------------------------------------------------------------
create or replace function public.nudge_member(p_group uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me record; tgt record; gname text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into me from public.group_members where group_id = p_group and user_id = uid;
  if me is null then raise exception 'not a member of this group'; end if;
  select * into tgt from public.group_members where id = p_member and group_id = p_group;
  if tgt is null or tgt.user_id is null then raise exception 'member not found'; end if;
  if tgt.user_id = uid then raise exception 'cannot nudge yourself'; end if;
  if not public.rate_limit('nudge:' || uid || ':' || p_member, 2, 86400) then
    raise exception 'You''ve already reminded them today.';
  end if;
  select name into gname from public.groups where id = p_group;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  values (tgt.user_id, 'nudge', 'Friendly reminder',
    coalesce(me.display_name, 'A group member') || ' nudged you to settle up in “'
    || coalesce(gname, 'a group') || '”.', p_group, uid);
end $$;
revoke execute on function public.nudge_member(uuid, uuid) from anon, public;
grant execute on function public.nudge_member(uuid, uuid) to authenticated;
