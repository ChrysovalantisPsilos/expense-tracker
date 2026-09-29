-- public.send_weekly_digests: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
create or replace function public.send_weekly_digests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u record; k text; n int := 0;
  d0 date := current_date - 6;
begin
  k := public.app_enc_key();
  for u in
    with spend as (
      -- One row per counted expense: a plain expense paid this week, or a
      -- part of a yearly (spread) row dated this week. Plain rows before the
      -- week are skipped before decrypting; spread rows reach back 120 months.
      select t.user_id, coalesce(c.name, 'Uncategorized') as cat,
             case when t.spread_months is null then b.v
                  else public.spread_part(b.v, t.spread_months, i.i) end as v
        from public.transactions t
        join public.profiles p on p.id = t.user_id
        left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
        cross join lateral generate_series(0, coalesce(t.spread_months, 1) - 1) as i(i)
        cross join lateral (
          select public.to_base_minor(public.dec_minor(t.amount_enc, k), t.exchange_rate,
                                      t.currency, coalesce(p.base_currency, 'EUR')) as v) b
       where t.kind = 'expense'
         and p.notify_digest
         and t.spent_at <= current_date
         and (t.spent_at >= d0
              or (t.spread_months is not null and t.spent_at > (d0 - interval '120 months')::date))
         and public.counts_in_month(t.spread_months, p.yearly_separate)
         and public.spread_part_date(t.spent_at, i.i) between d0 and current_date
    ), by_cat as (
      select s.user_id, s.cat, count(*) as cnt, sum(s.v) as v
        from spend s
       group by s.user_id, s.cat
    )
    -- The digest ranks categories by base value; a pending row (NULL) mustn't
    -- sort first.
    select bc.user_id, sum(bc.cnt)::int as cnt,
           (array_agg(bc.cat order by bc.v desc nulls last))[1] as top_name
      from by_cat bc
     group by bc.user_id
  loop
    insert into public.notifications (user_id, type, title, body)
    values (u.user_id, 'digest', 'Your week in money',
      u.cnt || ' expense' || case when u.cnt = 1 then '' else 's' end
      || ' this week · top category: ' || u.top_name || '. Open Budgeer to see your totals.');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_weekly_digests() from public, anon, authenticated;
