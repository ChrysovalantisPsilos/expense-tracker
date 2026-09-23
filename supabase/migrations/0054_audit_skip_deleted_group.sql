-- Deleting a group that has expenses failed: the cascade deletes each
-- group_expenses row, whose AFTER DELETE audit trigger then inserted a log row
-- for a group that no longer exists (FK violation). This broke both
-- delete_group and deleting the account of a sole group owner. Skip the audit
-- entry when the parent group is already gone. Body otherwise as in 0050.

create or replace function public.log_group_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; gid uuid; verb text; amt bytea; cur char(3); descr text; k text;
begin
  k := public.app_enc_key();
  if TG_OP = 'DELETE' then
    -- Cascading from the group's own deletion (delete_group, or its owner's
    -- account being deleted): the log dies with the group, so there is
    -- nothing to write, and inserting would violate the group_id FK.
    if not exists (select 1 from public.groups where id = OLD.group_id) then
      return null;
    end if;
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
