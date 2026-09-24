-- 0080: account deletion removes the notifications other people got about
-- what the departing user did.
--
-- 0078 rewrote other members' notifications by name, per group the user could
-- still be linked to. That misses a member who left a group without leaving
-- any expense or settlement behind: remove_group_member deletes such a member
-- row outright, so at deletion time nothing ties the user to that group, and
-- "Alex joined “Trip”" kept the name. A name can also have changed since the
-- notification was written (member names follow profile renames, 0017), so
-- no list of names is ever complete.
--
-- Every notification body that carries a person's name carries its ACTOR's
-- name, and the row links that actor: notifications.actor_id (0014) is set
-- by every insert path that writes a name — invite (inviter), member_joined
-- (the joiner), member_left (only on leaving oneself), expense (creator),
-- settlement (recorder), comment (author), nudge (the nudger). Budget, digest
-- and reminder notices name no one and have no actor. So the notifications
-- whose actor_id is the departing user are exactly the ones that can name
-- them: they are deleted with the account (as the user's own notifications
-- already are). No new data is stored to do this, and nothing is guessed from
-- the text. They are short-lived notices (90 days, 0073); what they reported
-- stays in the ledger and the change log, under "Former member".
--
-- The change-log part of 0078 (summaries rewritten per group) is unchanged:
-- a change-log row always belongs to a group the user is linked to through
-- a member row or its own actor_id.

create or replace function public.anonymise_departing_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare k text; g record; r record; plain text; red text;
begin
  -- Change-log texts, per group the user was in (as 0078).
  for g in
    select s.gid, array_agg(distinct s.nm) as names
      from (
        select m.group_id as gid, m.display_name as nm
          from public.group_members m
         where m.user_id = OLD.id or m.former_user_id = OLD.id
        union all
        select a.group_id, a.actor_name
          from public.group_audit_log a
         where a.actor_id = OLD.id
        union all
        select m.group_id, p.display_name
          from public.group_members m
          join public.profiles p on p.id = OLD.id
         where m.user_id = OLD.id or m.former_user_id = OLD.id
      ) s
     where s.nm is not null and btrim(s.nm) <> ''
       and s.nm not in ('Former member', 'Someone', 'System', '?')
     group by s.gid
  loop
    k := coalesce(k, public.app_enc_key());
    for r in select a.id, a.summary_enc from public.group_audit_log a where a.group_id = g.gid loop
      begin
        plain := public.dec_text(r.summary_enc, k);
      exception when others then
        plain := null;
      end;
      red := public.redact_names(plain, g.names);
      if red is distinct from plain then
        update public.group_audit_log set summary_enc = public.enc_text(red, k) where id = r.id;
      end if;
    end loop;
  end loop;

  -- Other people's notifications about something this user did (the only
  -- ones that name them). Their own go with the auth.users cascade.
  delete from public.notifications
   where actor_id = OLD.id and user_id <> OLD.id;

  update public.group_members
     set display_name = 'Former member', former_user_id = null
   where user_id = OLD.id or former_user_id = OLD.id;
  update public.group_audit_log
     set actor_name = 'Former member'
   where actor_id = OLD.id;
  return OLD;
end $$;
revoke execute on function public.anonymise_departing_user() from public, anon, authenticated;
-- The 0072 trigger (before delete on auth.users) keeps calling it.
