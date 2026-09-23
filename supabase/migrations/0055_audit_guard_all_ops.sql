-- 0054 guarded only the DELETE path of the audit trigger. Deleting a sole
-- group owner's account still failed: the cascade SET NULLs
-- group_expenses.created_by (an UPDATE), and that row trigger runs after the
-- group itself is deleted, so its audit insert violated the group_id FK.
-- Guard every op. Body otherwise as in 0054.

create or replace function public.log_group_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; gid uuid; verb text; amt bytea; cur char(3); descr text; k text;
begin
  -- The group is gone (or going): the log dies with it, so there is nothing
  -- to write, and inserting would violate the group_id FK. Applies to every
  -- op: deleting an owner's account also SET NULLs group_expenses.created_by,
  -- an UPDATE whose queued trigger runs after the group row is deleted.
  if not exists (select 1 from public.groups where id = coalesce(NEW.group_id, OLD.group_id)) then
    return null;
  end if;
  k := public.app_enc_key();
  if TG_OP = 'DELETE' then
    gid := OLD.group_id; verb := 'deleted'; amt := OLD.amount_enc; cur := OLD.currency;
    descr := coalesce(public.dec_text(OLD.description_enc, k), 'an expense');
  else
    gid := NEW.group_id; amt := NEW.amount_enc; cur := NEW.currency;
    descr := coalesce(public.dec_text(NEW.description_enc, k), 'an expense');
    verb := case when TG_OP = 'INSERT' then 'added' else 'edited' end;
  end if;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = auth.uid();
  insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary_enc, amount_enc, currency)
  values (gid, auth.uid(), coalesce(actor, 'System'), 'expense_' || verb,
          public.enc_text(coalesce(actor, 'Someone') || ' ' || verb || ' “' || descr || '”', k),
          amt, cur);
  return null;
end $$;
