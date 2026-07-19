-- Product decision: one single "Name" field. The separate Nickname is retired
-- from the UI, so a member's name everywhere is simply profiles.display_name.
-- (The nickname column is left in place but no longer read for display.)
--
-- This supersedes 0017's coalesce(nickname, display_name) rule.

-- Canonical group-facing name = display_name.
create or replace function public.member_name_for(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(display_name), ''), 'Member')
  from public.profiles where id = p_uid;
$$;

-- Propagate name edits: fire only on display_name change now.
create or replace function public.sync_member_display_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.display_name is distinct from OLD.display_name then
    update public.group_members
      set display_name = coalesce(nullif(btrim(NEW.display_name), ''), display_name)
      where user_id = NEW.id;
  end if;
  return NEW;
end $$;

-- Re-align every linked membership to the current display_name (flips anyone
-- who was showing an old nickname back to their real name).
update public.group_members m
  set display_name = coalesce(nullif(btrim(p.display_name), ''), m.display_name)
  from public.profiles p
  where p.id = m.user_id
    and m.display_name is distinct from coalesce(nullif(btrim(p.display_name), ''), m.display_name);
