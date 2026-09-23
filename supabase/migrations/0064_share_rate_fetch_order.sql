-- 0064: queue the ECB fetch AFTER a pending mirrored share is written.
--
-- 0062's sync_group_share asked fx_request() for a rate before inserting the
-- pending row, so fx_request saw no pending row to cover and (unless the
-- latest-rates refresh was due) queued nothing; the share then waited for the
-- next fx_sync cron run to queue the fetch (~5–10 minutes instead of ~5). A
-- date edit (sync_group_expense_meta) can also leave a share pending and now
-- queues the fetch too. Behaviour is otherwise unchanged.

create or replace function public.sync_group_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_exp record; v_rate numeric;
begin
  if TG_OP = 'DELETE' then
    select user_id into v_user from public.group_members where id = OLD.member_id;
    if v_user is not null then
      delete from public.transactions
        where user_id = v_user and group_expense_id = OLD.expense_id;
    end if;
    return OLD;
  end if;

  select user_id into v_user from public.group_members where id = NEW.member_id;
  select e.id, e.group_id, e.description_enc, e.spent_at, g.currency::text as gcur into v_exp
    from public.group_expenses e join public.groups g on g.id = e.group_id
   where e.id = NEW.expense_id;
  if v_user is not null and v_exp.id is not null then
    v_rate := public.member_share_rate(v_user, v_exp.gcur, v_exp.spent_at);
    insert into public.transactions
      (user_id, kind, amount_enc, currency, exchange_rate, description_enc,
       spent_at, is_shared, group_id, group_expense_id)
    values
      (v_user, 'expense', NEW.share_enc, v_exp.gcur, v_rate, v_exp.description_enc,
       v_exp.spent_at, true, v_exp.group_id, NEW.expense_id)
    on conflict (user_id, group_expense_id) where group_expense_id is not null
    do update
      set amount_enc      = excluded.amount_enc,
          currency        = excluded.currency,
          exchange_rate   = excluded.exchange_rate,
          description_enc = excluded.description_enc,
          spent_at        = excluded.spent_at;
    -- Now that the pending row exists, a fetch covering its date is queued.
    if v_rate is null then perform public.fx_request(); end if;
  end if;
  return NEW;
end $$;

create or replace function public.sync_group_expense_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transactions t
    set description_enc = NEW.description_enc, spent_at = NEW.spent_at,
        exchange_rate = case when NEW.spent_at is distinct from OLD.spent_at
                             then public.member_share_rate(t.user_id, t.currency, NEW.spent_at)
                             else t.exchange_rate end
    where t.group_expense_id = NEW.id
      and exists (select 1 from public.group_members m
                  where m.group_id = NEW.group_id and m.user_id = t.user_id);
  if NEW.spent_at is distinct from OLD.spent_at
     and exists (select 1 from public.transactions
                  where group_expense_id = NEW.id and exchange_rate is null) then
    perform public.fx_request();
  end if;
  return NEW;
end $$;
