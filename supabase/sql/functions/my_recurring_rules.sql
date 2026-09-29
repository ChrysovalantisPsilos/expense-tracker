-- public.my_recurring_rules: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
create or replace function public.my_recurring_rules()
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, description text, frequency text, interval_n integer,
  next_run date, end_date date, is_active boolean, created_at timestamptz,
  remind_days_before integer, last_reminded_for date, categories jsonb, savings_from_income boolean,
  paid_from_savings boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, r.kind::text, r.category_id, r.account_id,
         public.dec_minor(r.amount_enc, k.k), r.currency::text,
         public.dec_text(r.description_enc, k.k), r.frequency::text, r.interval_n,
         r.next_run, r.end_date, r.is_active, r.created_at, r.remind_days_before,
         r.last_reminded_for,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end,
         r.savings_from_income, r.paid_from_savings
  from public.recurring_rules r
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = r.category_id and c.user_id = r.user_id
  where r.user_id = auth.uid()
  order by r.is_active desc, r.next_run asc
$$;
revoke execute on function public.my_recurring_rules() from anon, public;
grant execute on function public.my_recurring_rules() to authenticated;
