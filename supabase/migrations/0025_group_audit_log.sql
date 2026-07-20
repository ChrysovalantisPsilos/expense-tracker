-- Immutable group audit trail: every expense add/edit/delete and every
-- settlement is recorded here by SECURITY DEFINER triggers. Members can READ
-- their group's log; there is NO insert/update/delete policy, so no client
-- (not even the owner) can write or alter it through the API — only the
-- triggers, which run as definer. Names are snapshotted at event time so the
-- record stays true even if someone later renames or deletes their account.

create table if not exists public.group_audit_log (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text not null,
  action       text not null,          -- expense_added|expense_edited|expense_deleted|settlement_added
  summary      text not null,
  amount_minor bigint,
  currency     char(3),
  created_at   timestamptz not null default now()
);
create index if not exists group_audit_log_group_idx
  on public.group_audit_log(group_id, created_at desc);

alter table public.group_audit_log enable row level security;
-- Read-only to members; append-only (no insert/update/delete policy exists).
drop policy if exists gal_select on public.group_audit_log;
create policy gal_select on public.group_audit_log for select to authenticated
  using (public.is_group_member(group_id));

create or replace function public.log_group_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; gid uuid; verb text; amt bigint; cur char(3); descr text;
begin
  if TG_OP = 'DELETE' then
    gid := OLD.group_id; verb := 'deleted'; amt := OLD.amount_minor; cur := OLD.currency;
    descr := coalesce(OLD.description, 'an expense');
  else
    gid := NEW.group_id; amt := NEW.amount_minor; cur := NEW.currency;
    descr := coalesce(NEW.description, 'an expense');
    verb := case when TG_OP = 'INSERT' then 'added' else 'edited' end;
  end if;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = auth.uid();
  insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary, amount_minor, currency)
  values (gid, auth.uid(), coalesce(actor, 'System'), 'expense_' || verb,
          coalesce(actor, 'Someone') || ' ' || verb || ' “' || descr || '”', amt, cur);
  return null;
end $$;
drop trigger if exists trg_log_expense on public.group_expenses;
create trigger trg_log_expense after insert or update or delete on public.group_expenses
  for each row execute function public.log_group_expense();

create or replace function public.log_settlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; frm text; dst text;
begin
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = auth.uid();
  select display_name into frm from public.group_members where id = NEW.from_member;
  select display_name into dst from public.group_members where id = NEW.to_member;
  insert into public.group_audit_log (group_id, actor_id, actor_name, action, summary, amount_minor, currency)
  values (NEW.group_id, auth.uid(), coalesce(actor, 'System'), 'settlement_added',
          coalesce(actor, 'Someone') || ' recorded a payment: ' || coalesce(frm, '?') || ' → ' || coalesce(dst, '?'),
          NEW.amount_minor, NEW.currency);
  return null;
end $$;
drop trigger if exists trg_log_settlement on public.settlements;
create trigger trg_log_settlement after insert on public.settlements
  for each row execute function public.log_settlement();

revoke execute on function public.log_group_expense() from anon, authenticated, public;
revoke execute on function public.log_settlement() from anon, authenticated, public;
