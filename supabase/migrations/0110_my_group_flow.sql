-- 0110: Home's Net counts the money groups really moved.
--
-- A group expense mirrors only the member's share into their personal entries
-- (0008), so Home's Net behaved as if everyone had already paid each other
-- back. The owner's rule ("count what really moved"; Spent and the categories
-- stay as they are, the share):
--   * an expense I paid lowers Net by the full amount (the share is already
--     in Spent; the rest is "paid for others");
--   * an expense someone else paid leaves Net alone until I pay (the share in
--     Spent is added back: "paid for you");
--   * a settlement I receive raises Net, one I pay lowers it.
-- Once everything is settled the adjustments cancel out. The maths is the
-- client's (dashboardMath.groupFlow, the iOS app through the core); this
-- function only reads what it needs, decrypted.
--
-- my_group_flow(p_from, p_to): the caller's group money moves dated in
-- [p_from, p_to] (either end null = open), one row each:
--   * kind 'expense': a group expense the caller paid or has a mirrored
--     share of, on its spent_at. amount_minor = the expense in the GROUP
--     currency (as _group_net credits the payer), share_minor = the caller's
--     mirrored share (0 without one), paid_by_me. currency = the group's;
--     exchange_rate = the mirrored row's own rate (so the share added back
--     is exactly the one in Spent), else the member's ECB rate for the day
--     (member_share_rate); null = pending, which the client fills from ECB
--     as it does for the transactions (fx.js fillPendingRates).
--   * kind 'settlement': a settlement from or to the caller, on its
--     settled_at; amount_minor in the group currency (as balances count it),
--     paid_by_me = the caller paid it, the rate as above for that day.
-- Only the caller's own member rows count (group_members.user_id =
-- auth.uid()), so another group, or another member's moves, never show.
--
-- search_path pinned; EXECUTE revoked from public/anon, granted to
-- authenticated (Home and the iOS app call it).
create or replace function public.my_group_flow(p_from date default null, p_to date default null)
returns table(kind text, spent_at date, amount_minor bigint, share_minor bigint,
  currency text, exchange_rate numeric, paid_by_me boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with k as (select public.app_enc_key() as k),
  me as (
    select m.id, m.group_id, g.currency::text as cur
      from public.group_members m
      join public.groups g on g.id = m.group_id
     where m.user_id = auth.uid() and auth.uid() is not null)
  select 'expense'::text, e.spent_at,
         public.to_base_minor(public.dec_minor(e.amount_enc, k.k), e.exchange_rate, e.currency, me.cur),
         coalesce(public.dec_minor(t.amount_enc, k.k), 0),
         me.cur,
         case when t.id is not null then t.exchange_rate
              else public.member_share_rate(auth.uid(), me.cur, e.spent_at) end,
         e.paid_by = me.id
    from me
    cross join k
    join public.group_expenses e on e.group_id = me.group_id
    left join public.transactions t on t.user_id = auth.uid() and t.group_expense_id = e.id
   where (e.paid_by = me.id or t.id is not null)
     and (p_from is null or e.spent_at >= p_from)
     and (p_to is null or e.spent_at <= p_to)
  union all
  select 'settlement'::text, s.settled_at,
         public.dec_minor(s.amount_enc, k.k),
         null::bigint,
         me.cur,
         public.member_share_rate(auth.uid(), me.cur, s.settled_at),
         s.from_member = me.id
    from me
    cross join k
    join public.settlements s on s.group_id = me.group_id
                             and me.id in (s.from_member, s.to_member)
                             and s.from_member <> s.to_member
   where (p_from is null or s.settled_at >= p_from)
     and (p_to is null or s.settled_at <= p_to)
$$;
revoke execute on function public.my_group_flow(date, date) from public, anon;
grant execute on function public.my_group_flow(date, date) to authenticated;
