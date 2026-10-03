-- public.pay_month_windows: the current definition (canonical copy).
-- To change it, edit this file, then paste the whole file into a new
-- migration; test/sqlFunctions.test.js keeps the two equal.
create or replace function public.pay_month_windows(p_user uuid, p_first date, p_last date, p_today date default null)
returns table(month date, from_date date, to_date date, open boolean)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare d int; today date := coalesce(p_today, public.user_today(p_user));
        m0 date := date_trunc('month', p_first)::date; m1 date := date_trunc('month', p_last)::date;
begin
  select p.salary_shift_from_day into d from public.profiles p
   where p.id = p_user and p.salary_shift_from_day between 1 and 31 and p.salary_category_id is not null;
  if d is null then
    -- The setting off: calendar months, open while they're today's.
    return query
      select g::date, g::date, (g + interval '1 month - 1 day')::date, date_trunc('month', today)::date = g::date
        from generate_series(m0, m1, interval '1 month') g;
    return;
  end if;
  return query
  with recursive days as (
    select x.pd from public.pay_days(p_user) as x(pd)
  ), opens as (            -- payCalendar.opensMonth
    select case when extract(day from x.pd)::int >= least(d, extract(day from (date_trunc('month', x.pd)
                       + interval '1 month - 1 day'))::int)
                then (date_trunc('month', x.pd) + interval '1 month')::date else date_trunc('month', x.pd)::date end as label,
           case when extract(day from x.pd)::int >= least(d, extract(day from (date_trunc('month', x.pd)
                       + interval '1 month - 1 day'))::int)
                then x.pd else date_trunc('month', x.pd)::date end as start
      from days x
  ), real as (             -- rule 1: the earliest start a payday opens a month with
    select o.label, min(o.start) as start from opens o group by o.label
  ), bounds as (
    select min(o.label) as first, (select max(x.pd) from days x) as last_pay,
           greatest(max(o.label), (date_trunc('month', today) + interval '1 month')::date,
                    (m1 + interval '1 month')::date) as last
      from opens o
  ), walk(label, start, is_set) as (
    -- From the first payday's month (the floor: anything earlier is a
    -- calendar month), each month's start from the one before it.
    select b.first, s.start, s.is_set
      from bounds b
      cross join lateral (
        select coalesce((select r.start from real r where r.label = b.first),
                        case when today >= b.first + least(d, extract(day from (b.first + interval '1 month - 1 day'))::int) - 1
                               or b.last_pay >= b.first + least(d, extract(day from (b.first + interval '1 month - 1 day'))::int) - 1
                             then (b.first - interval '1 month')::date
                                  + least(d, extract(day from (b.first - interval '1 day'))::int) - 1 end) as cand
      ) c
      cross join lateral (
        select case when c.cand is null then b.first
                    else greatest(c.cand, (b.first - interval '1 month')::date + 1) end as start,
               c.cand is not null as is_set
      ) s
     where b.first is not null
    union all
    select n.label, s.start, s.is_set
      from walk w
      cross join bounds b
      cross join lateral (select (w.label + interval '1 month')::date as label) n
      cross join lateral (
        -- rules 1 and 3: a real start, else certainly missing (today or a
        -- payday is past D of the month): D of the month before.
        select coalesce((select r.start from real r where r.label = n.label),
                        case when today >= n.label + least(d, extract(day from (n.label + interval '1 month - 1 day'))::int) - 1
                               or b.last_pay >= n.label + least(d, extract(day from (n.label + interval '1 month - 1 day'))::int) - 1
                             then w.label + least(d, extract(day from (n.label - interval '1 day'))::int) - 1 end) as cand
      ) c
      cross join lateral (
        -- The guard: never before the day after the previous month's start.
        -- Rule 4 (not known yet): the 1st, provisionally.
        select case when c.cand is null then n.label else greatest(c.cand, w.start + 1) end as start,
               c.cand is not null as is_set
      ) s
     where w.label < b.last
  )
  select g::date,
         coalesce(ws.start, g::date),
         (coalesce(wn.start, (g + interval '1 month')::date) - 1)::date,
         not (coalesce(wn.is_set, false) or today >= (g + interval '1 month')::date)
    from generate_series(m0, m1, interval '1 month') g
    left join walk ws on ws.label = g::date and ws.is_set
    left join walk wn on wn.label = (g + interval '1 month')::date and wn.is_set
   order by 1;
end $$;
revoke execute on function public.pay_month_windows(uuid, date, date, date) from public, anon, authenticated;
