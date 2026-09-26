-- Settings › Import rules: the user can now see, edit and delete the
-- auto-category rules the import wizard saves (category_rules, 0040). The
-- table keeps its per-verb RLS (0058: own rows only, split select / insert /
-- update / delete); what was missing for a client edit path is a
-- server-authoritative guard, like categories_guard (0060):
--
-- category_rules_guard (BEFORE INSERT OR UPDATE):
--   - an insert is stamped with the caller's id (definer/service paths —
--     the demo seed — keep the id they pass, as for categories);
--   - an update can't move a rule to another account;
--   - the pattern is whitespace-collapsed and trimmed before the length CHECK;
--   - the category must be one of the rule owner's own categories (the FK
--     alone accepted any user's category id).
-- It runs as the caller (no SECURITY DEFINER): the category lookup reads
-- through the caller's own RLS, and delete_category (definer) moving rules to
-- another of the owner's categories still passes.

create or replace function public.category_rules_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'not allowed';
  end if;
  new.pattern := btrim(regexp_replace(new.pattern, '\s+', ' ', 'g'));
  if not exists (select 1 from public.categories c
                  where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'category not found';
  end if;
  return new;
end $$;
revoke execute on function public.category_rules_guard() from public, anon, authenticated;

drop trigger if exists category_rules_guard on public.category_rules;
create trigger category_rules_guard
  before insert or update on public.category_rules
  for each row execute function public.category_rules_guard();
