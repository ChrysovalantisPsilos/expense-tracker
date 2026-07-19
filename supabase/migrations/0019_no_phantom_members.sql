-- Product decision: people become group members only by accepting an invite
-- (email or link). The "add a person by name" field that created phantom
-- placeholder rows (group_members.user_id null) is gone.
--
-- The old gm_insert policy let any member insert arbitrary member rows, which
-- is what powered add-by-name. Tighten it so a client can only ever insert a
-- row representing THEMSELVES in a group they already belong to — which is
-- unreachable in practice, so all membership writes now go exclusively through
-- the SECURITY DEFINER join/invite RPCs (create_group, accept_group_invite,
-- respond_to_invite), which bypass RLS. Net effect: no new phantoms, and no
-- involuntarily adding someone else by user_id.
--
-- Note: user_id keeps its `on delete set null` FK, so deleting an account still
-- leaves that person's historical member row intact for split/settlement
-- integrity — that path is unaffected by this insert policy.

drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_group_member(group_id) or public.is_group_owner(group_id))
  );
