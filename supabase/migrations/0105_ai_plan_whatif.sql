-- 0105: a fourth optional AI helper, "What-if in your own words" (Plan mode):
-- a typed line like "cancel Netflix, add a gym at €40 a month" becomes
-- proposed plan changes for the user to check. The edge function ai-helper
-- (action plan_whatif) does the calling; it builds what is sent from the
-- caller's own recurring payments and income (my_recurring_rules, as the
-- caller) and validates the answer. Nothing new is stored: the proposals only
-- reach the plan (a sandbox, 0095) when the user adds them.
--
--   1. profiles.ai_plan_whatif: the helper's switch, default OFF for every
--      account (existing ones too), read and written by the owner like the
--      other three (own-row RLS, column grants). The demo login can't turn it
--      on (profiles_ai_demo_guard).
--   2. Every change is a consents row (source 'settings'), purpose
--      'ai_plan_whatif' (log_ai_consent, rate-limited 60/hour as before).
--   3. ai_helper_start accepts 'plan_whatif': its switch must be on and the
--      account not the demo; 30 calls an hour per user, under the same overall
--      daily cap.
-- export_my_data carries the switch with the rest of the profile (0074
-- exports the whole row); demo_wipe and account deletion need nothing new.
--
-- 0101 closed new functions by default: every function here pins
-- search_path = public, pg_temp; ai_helper_start is granted to authenticated
-- again, the trigger functions to nobody.

-- 1 ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists ai_plan_whatif boolean not null default false;
grant select (ai_plan_whatif) on public.profiles to authenticated;
grant update (ai_plan_whatif) on public.profiles to authenticated;

create or replace function public.profiles_ai_demo_guard()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') and OLD.is_demo
     and ((NEW.ai_quick_entry and not OLD.ai_quick_entry)
          or (NEW.ai_import_categories and not OLD.ai_import_categories)
          or (NEW.ai_month_summary and not OLD.ai_month_summary)
          or (NEW.ai_plan_whatif and not OLD.ai_plan_whatif)) then
    raise exception 'That isn’t available on the demo account.';
  end if;
  return NEW;
end $$;
revoke execute on function public.profiles_ai_demo_guard() from public, anon, authenticated;
drop trigger if exists trg_profiles_ai_demo_guard on public.profiles;
create trigger trg_profiles_ai_demo_guard
  before update of ai_quick_entry, ai_import_categories, ai_month_summary, ai_plan_whatif on public.profiles
  for each row execute function public.profiles_ai_demo_guard();

-- 2 ---------------------------------------------------------------------------
alter table public.consents drop constraint if exists consents_purpose_check;
alter table public.consents add constraint consents_purpose_check check (purpose in (
  'privacy_notice', 'terms', 'weekly_digest', 'email_notifications', 'push_notifications',
  'ai_quick_entry', 'ai_import_categories', 'ai_month_summary', 'ai_plan_whatif'));

create or replace function public.log_ai_consent()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if NEW.ai_quick_entry is not distinct from OLD.ai_quick_entry
     and NEW.ai_import_categories is not distinct from OLD.ai_import_categories
     and NEW.ai_month_summary is not distinct from OLD.ai_month_summary
     and NEW.ai_plan_whatif is not distinct from OLD.ai_plan_whatif then
    return null;
  end if;
  if auth.uid() is not null
     and not public.rate_limit('ai-prefs:' || NEW.id, 60, 3600) then
    raise exception 'Too many changes — please try again later.';
  end if;
  if NEW.ai_quick_entry is distinct from OLD.ai_quick_entry then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_quick_entry', NEW.ai_quick_entry, 'settings');
  end if;
  if NEW.ai_import_categories is distinct from OLD.ai_import_categories then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_import_categories', NEW.ai_import_categories, 'settings');
  end if;
  if NEW.ai_month_summary is distinct from OLD.ai_month_summary then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_month_summary', NEW.ai_month_summary, 'settings');
    if not NEW.ai_month_summary then
      delete from public.ai_month_summaries where user_id = NEW.id;
    end if;
  end if;
  if NEW.ai_plan_whatif is distinct from OLD.ai_plan_whatif then
    insert into public.consents (user_id, purpose, granted, source)
    values (NEW.id, 'ai_plan_whatif', NEW.ai_plan_whatif, 'settings');
  end if;
  return null;
end $$;
revoke execute on function public.log_ai_consent() from public, anon, authenticated;
drop trigger if exists trg_profiles_ai_consent_log on public.profiles;
create trigger trg_profiles_ai_consent_log
  after update of ai_quick_entry, ai_import_categories, ai_month_summary, ai_plan_whatif on public.profiles
  for each row execute function public.log_ai_consent();

-- 3 ---------------------------------------------------------------------------
create or replace function public.ai_helper_start(p_helper text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); p record; on_ boolean; lim int; win int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select pr.base_currency, pr.is_demo, pr.ai_quick_entry, pr.ai_import_categories, pr.ai_month_summary,
         pr.ai_plan_whatif
    into p from public.profiles pr where pr.id = uid;
  on_ := case p_helper
           when 'parse_entry' then p.ai_quick_entry
           when 'suggest_categories' then p.ai_import_categories
           when 'month_summary' then p.ai_month_summary
           when 'plan_whatif' then p.ai_plan_whatif
         end;
  if not coalesce(on_, false) or coalesce(p.is_demo, false) then
    raise exception 'AI helper is off';
  end if;
  lim := case p_helper when 'parse_entry' then 60 when 'suggest_categories' then 20
                       when 'plan_whatif' then 30 else 10 end;
  win := case p_helper when 'month_summary' then 86400 else 3600 end;
  if not public.rate_limit('ai:' || p_helper || ':' || uid, lim, win)
     or not public.rate_limit('ai:all', 5000, 86400) then
    raise exception 'Too many requests — please try again later.';
  end if;
  return jsonb_build_object('base_currency', coalesce(p.base_currency, 'EUR'));
end $$;
revoke execute on function public.ai_helper_start(text) from public, anon;
grant execute on function public.ai_helper_start(text) to authenticated;
