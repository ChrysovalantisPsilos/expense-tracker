-- 0098: a meal voucher top-up day can be any day of the month (1–31).
--
-- The setup now picks the next top-up on a calendar, and its day repeats
-- every month; a day past a shorter month's end lands on that month's last
-- day (the app's maths, voucherMath.topUpIn). 0097 allowed 1–28 only.
-- meal_vouchers_check is 0097's, with that one bound changed; same pinned
-- search_path and revoked grants. Nothing else changes.

create or replace function public.meal_vouchers_check(p jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare e record;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad setup'; end if;
  if octet_length(p::text) > 4096 then raise exception 'bad setup'; end if;
  if exists (select 1 from jsonb_object_keys(p) k
             where k not in ('v', 'country', 'per_day_minor', 'currency', 'topup_day',
                             'start_on', 'start_balance_minor', 'days')) then
    raise exception 'bad setup';
  end if;
  if p->'v' is distinct from '1'::jsonb
     or coalesce(p->>'country', '') not in ('BE', 'GR')
     or coalesce(p->>'currency', '') !~ '^[A-Z]{3}$'
     or jsonb_typeof(p->'per_day_minor') is distinct from 'number'
     or jsonb_typeof(p->'topup_day') is distinct from 'number'
     or jsonb_typeof(p->'start_balance_minor') is distinct from 'number'
     or jsonb_typeof(p->'start_on') is distinct from 'string'
     or jsonb_typeof(p->'days') is distinct from 'object' then
    raise exception 'bad setup';
  end if;
  if (p->>'per_day_minor') !~ '^[0-9]{1,7}$' or (p->>'topup_day') !~ '^[0-9]{1,2}$'
     or (p->>'start_balance_minor') !~ '^[0-9]{1,12}$'
     or (p->>'start_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'bad setup';
  end if;
  if (p->>'per_day_minor')::int <= 0 or (p->>'topup_day')::int not between 1 and 31 then
    raise exception 'bad setup';
  end if;
  perform (p->>'start_on')::date;   -- a real date, or it raises
  if (select count(*) from jsonb_object_keys(p->'days')) > 24 then raise exception 'bad setup'; end if;
  for e in select key, value from jsonb_each(p->'days') loop
    if e.key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(e.value) <> 'number'
       or (e.value #>> '{}') !~ '^[0-9]{1,2}$' then
      raise exception 'bad setup';
    end if;
    if (e.value #>> '{}')::int > 31 then raise exception 'bad setup'; end if;
  end loop;
end $$;
revoke execute on function public.meal_vouchers_check(jsonb) from public, anon, authenticated;
