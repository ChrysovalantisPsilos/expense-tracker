-- 0102: Salary history — the user's own notes on their salary entries, for
-- Insights › Your salary (/insights/salary). The page works everything out
-- on the device from the Salary and Bonus income entries
-- (src/features/salary/salaryMath.js): each month's regular pay, raises, and
-- the extras (holiday pay, 13th month, bonus), which it guesses. What the
-- user corrects is kept here, so it follows them to every device.
--
-- The Bonus category needs nothing new: its default key ('bonus') has been in
-- category_default_key, seed_default_categories and the backfill since 0094,
-- so every account's default "Bonus" income category already carries it.
--
--   1. salary_history — ONE document per account (user_id is the key),
--      encrypted at rest like other personal data (enc_text + app_enc_key):
--        { v: 1,
--          fixes: { '<transaction id>': 'regular' | 'holiday' | 'thirteenth'
--                   | 'bonus' },            the user's corrections (≤ 1000)
--          bonus_category_id?: uuid | null, the Bonus category, picked on the
--                                           page when none has the key
--          country?: 'BE' | 'GR' }          prices compared against
--      RLS on, no policies and no grants — reached only through the definer
--      functions below; the 0095 owner guard forces user_id to the caller.
--   2. salary_history_check(doc): the shape, or 'bad salary notes'.
--   3. my_salary_history()        the caller's document, or null
--      save_salary_history(doc)   validates it (and that the Bonus category
--                                 is the caller's own income category),
--                                 300 saves/hour; null deletes it.
--      0101 closed new functions by default: both are granted to
--      authenticated here, the check to nobody.
--   4. export_my_data() (as 0097) also returns the document. Account deletion
--      needs nothing new (the table cascades from auth.users).
--   5. demo_wipe (as 0097) also clears the demo accounts' documents.

-- 1 ---------------------------------------------------------------------------
create table if not exists public.salary_history (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload_enc bytea not null,
  updated_at  timestamptz not null default now()
);
alter table public.salary_history enable row level security;
revoke all on public.salary_history from public, anon, authenticated;

drop trigger if exists salary_history_owner_guard on public.salary_history;
create trigger salary_history_owner_guard
  before insert or update on public.salary_history
  for each row execute function public.recurring_plan_owner_guard();

-- 2 ---------------------------------------------------------------------------
-- Each test on its own line: SQL doesn't promise to stop at the first false one.
create or replace function public.salary_history_check(p jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare e record;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad salary notes'; end if;
  if octet_length(p::text) > 65536 then raise exception 'bad salary notes'; end if;
  if exists (select 1 from jsonb_object_keys(p) k
             where k not in ('v', 'fixes', 'bonus_category_id', 'country')) then
    raise exception 'bad salary notes';
  end if;
  if p->'v' is distinct from '1'::jsonb
     or jsonb_typeof(p->'fixes') is distinct from 'object' then
    raise exception 'bad salary notes';
  end if;
  if p ? 'country' and coalesce(p->>'country', '') not in ('BE', 'GR') then
    raise exception 'bad salary notes';
  end if;
  if p ? 'bonus_category_id' and jsonb_typeof(p->'bonus_category_id') <> 'null'
     and coalesce(p->>'bonus_category_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'bad salary notes';
  end if;
  if (select count(*) from jsonb_object_keys(p->'fixes')) > 1000 then raise exception 'bad salary notes'; end if;
  for e in select key, value from jsonb_each(p->'fixes') loop
    if e.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(e.value) <> 'string'
       or (e.value #>> '{}') not in ('regular', 'holiday', 'thirteenth', 'bonus') then
      raise exception 'bad salary notes';
    end if;
  end loop;
end $$;
revoke execute on function public.salary_history_check(jsonb) from public, anon, authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.my_salary_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return (select public.dec_text(s.payload_enc, public.app_enc_key())::jsonb
            from public.salary_history s where s.user_id = uid);
end $$;
revoke execute on function public.my_salary_history() from public, anon;
grant execute on function public.my_salary_history() to authenticated;

create or replace function public.save_salary_history(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); bonus uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p is not null and jsonb_typeof(p) <> 'null' then
    perform public.salary_history_check(p);
    bonus := (p->>'bonus_category_id')::uuid;
    if bonus is not null and not exists (
         select 1 from public.categories c
          where c.id = bonus and c.user_id = uid and c.kind = 'income') then
      raise exception 'category not found';
    end if;
  end if;
  if not public.rate_limit('salary:' || uid, 300, 3600) then
    raise exception 'Too many saves — please slow down.';
  end if;
  if p is null or jsonb_typeof(p) = 'null' then
    delete from public.salary_history where user_id = uid;
    return;
  end if;
  insert into public.salary_history (user_id, payload_enc, updated_at)
  values (uid, public.enc_text(p::text, public.app_enc_key()), now())
  on conflict (user_id) do update set payload_enc = excluded.payload_enc, updated_at = now();
end $$;
revoke execute on function public.save_salary_history(jsonb) from public, anon;
grant execute on function public.save_salary_history(jsonb) to authenticated;

-- 4 ---------------------------------------------------------------------------
-- As 0097, plus the salary notes (decrypted, the caller's only).
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); doc jsonb; k text;
begin
  doc := public.build_my_data_export();   -- checks the caller and the 10/h limit
  perform public.enqueue_privacy_email(uid, 'data_export');
  k := public.app_enc_key();
  return doc || jsonb_build_object(
    'privacy_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', q.kind, 'last_event_at', q.last_event_at, 'last_sent_at', q.last_sent_at,
        'next_due_at', q.due_at) order by q.kind), '[]'::jsonb)
      from public.privacy_email_queue q where q.user_id = uid),
    'legal_update_emails', (select coalesce(jsonb_agg(jsonb_build_object(
        'privacy_version', n.privacy_version, 'terms_version', n.terms_version,
        'emailed_at', n.emailed_at)), '[]'::jsonb)
      from public.legal_update_notices n where n.user_id = uid),
    'recurring_plan', (select jsonb_build_object(
        'plan', public.dec_text(p.payload_enc, k)::jsonb, 'updated_at', p.updated_at)
      from public.recurring_plans p where p.user_id = uid),
    'recurring_plan_undo', (select jsonb_build_object(
        'applied_at', u.applied_at, 'change_count', u.change_count,
        'snapshot', public.dec_text(u.snapshot_enc, k)::jsonb)
      from public.recurring_plan_undo u where u.user_id = uid),
    'meal_vouchers', (select jsonb_build_object(
        'setup', public.dec_text(m.payload_enc, k)::jsonb, 'updated_at', m.updated_at)
      from public.meal_vouchers m where m.user_id = uid),
    'salary_history', (select jsonb_build_object(
        'notes', public.dec_text(s.payload_enc, k)::jsonb, 'updated_at', s.updated_at)
      from public.salary_history s where s.user_id = uid));
end $$;

-- 5 ---------------------------------------------------------------------------
-- As 0097, plus the salary notes.
create or replace function public.demo_wipe(p_ids uuid[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from public.notifications where user_id = any(p_ids);
  delete from public.groups where owner_id = any(p_ids);
  delete from public.group_invites where created_by = any(p_ids) or invited_user_id = any(p_ids);
  update public.profiles set salary_category_id = null where id = any(p_ids);
  delete from public.recurring_plans where user_id = any(p_ids);
  delete from public.recurring_plan_undo where user_id = any(p_ids);
  delete from public.meal_vouchers where user_id = any(p_ids);
  delete from public.salary_history where user_id = any(p_ids);
  delete from public.transactions where user_id = any(p_ids);
  delete from public.recurring_rules where user_id = any(p_ids);
  delete from public.budgets where user_id = any(p_ids);
  delete from public.category_rules where user_id = any(p_ids);
  delete from public.accounts where user_id = any(p_ids);
  delete from public.savings_goals where user_id = any(p_ids);
  delete from public.categories where user_id = any(p_ids);
  delete from public.push_subscriptions where user_id = any(p_ids);
  delete from public.consents where user_id = any(p_ids);
  delete from public.privacy_email_queue where user_id = any(p_ids);
  delete from public.inactivity_notices where user_id = any(p_ids);
  delete from public.legal_update_notices where user_id = any(p_ids);
  delete from public.rate_limits r
   where exists (select 1 from unnest(p_ids) i where position(i::text in r.key) > 0);
end $$;
revoke execute on function public.demo_wipe(uuid[]) from public, anon, authenticated;
