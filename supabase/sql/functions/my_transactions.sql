-- public.my_transactions: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
create or replace function public.my_transactions(
  p_kind text default null, p_from date default null, p_to date default null,
  p_category uuid default null, p_limit integer default null, p_spread boolean default false,
  p_paid_from_savings boolean default false, p_paid_with_vouchers boolean default false)
returns table(id uuid, user_id uuid, kind text, category_id uuid, account_id uuid,
  amount_minor bigint, currency text, exchange_rate numeric, description text, notes text,
  spent_at date, group_id uuid, is_shared boolean, client_uuid uuid,
  created_at timestamptz, updated_at timestamptz, group_expense_id uuid,
  categories jsonb, group_expenses jsonb, recurring_rule_id uuid, recurring jsonb,
  spread_months smallint, savings_from_income boolean, paid_from_savings boolean,
  paid_with_vouchers boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.kind::text, t.category_id, t.account_id,
         public.dec_minor(t.amount_enc, k.k), t.currency::text, t.exchange_rate,
         public.dec_text(t.description_enc, k.k), public.dec_text(t.notes_enc, k.k),
         t.spent_at, t.group_id, t.is_shared, t.client_uuid, t.created_at,
         t.updated_at, t.group_expense_id,
         case when c.id is not null then jsonb_build_object(
           'name', c.name, 'icon', c.icon, 'color', c.color, 'default_key', c.default_key) end,
         case when g.id is not null then jsonb_build_object('groups', jsonb_build_object('name', g.name)) end,
         t.recurring_rule_id,
         case when rr.id is not null then jsonb_build_object(
           'frequency', rr.frequency, 'interval_n', rr.interval_n, 'is_active', rr.is_active) end,
         t.spread_months, t.savings_from_income, t.paid_from_savings, t.paid_with_vouchers
  from public.transactions t
  cross join (select public.app_enc_key() as k) k
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.group_expenses ge on ge.id = t.group_expense_id
  left join public.groups g on g.id = ge.group_id and public.is_group_member(ge.group_id)
  left join public.recurring_rules rr on rr.id = t.recurring_rule_id and rr.user_id = t.user_id
  where t.user_id = auth.uid()
    and (p_kind is null or t.kind::text = p_kind)
    and (p_from is null or t.spent_at >= p_from
         or (p_spread and t.kind = 'expense' and t.spread_months is not null
             and t.spent_at >= (p_from - interval '119 months')::date
             and date_trunc('month', t.spent_at) + make_interval(months => t.spread_months) > p_from))
    and (p_to is null or t.spent_at <= p_to)
    and (p_category is null or t.category_id = p_category)
    and (not coalesce(p_paid_from_savings, false) or t.paid_from_savings)
    and (not coalesce(p_paid_with_vouchers, false) or t.paid_with_vouchers)
  order by t.spent_at desc, t.created_at desc
  limit p_limit
$$;
revoke execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean, boolean) from public, anon;
grant execute on function public.my_transactions(text, date, date, uuid, integer, boolean, boolean, boolean) to authenticated;
