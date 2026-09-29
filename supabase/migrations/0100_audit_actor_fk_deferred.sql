-- 0100: deleting several accounts in one statement no longer trips the
-- change log's actor foreign key.
--
-- The anonymise_departing_user trigger (BEFORE DELETE on auth.users, latest
-- in 0080) rewrites the change-log texts (group_audit_log.summary_enc) of
-- every group the departing user was in, including rows whose actor is
-- someone else. When two users go in ONE statement, the second one's trigger
-- can update a row whose actor was deleted just before: that user's row is
-- gone, but its ON DELETE SET NULL only runs at the end of the statement, so
-- the foreign-key check on the updated row fails
-- (group_audit_log_actor_id_fkey). Postgres skips that check when the key
-- didn't change on a row from an earlier transaction, so it showed on rows
-- written in the same transaction (the DB test), in whichever order the
-- random ids put the deletes.
--
-- The check is now DEFERRABLE INITIALLY DEFERRED: it runs at commit, after
-- the SET NULL has run. ON DELETE SET NULL itself is unchanged (referential
-- actions are never deferred).
--
-- The trigger's other writes don't have this hazard: notifications are only
-- deleted there (a delete isn't checked against auth.users), the
-- group_members rows it updates are linked to the departing user (who still
-- exists at that point) or detached (user_id null), and former_user_id has no
-- foreign key.

alter table public.group_audit_log
  drop constraint group_audit_log_actor_id_fkey,
  add constraint group_audit_log_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null
    deferrable initially deferred;
