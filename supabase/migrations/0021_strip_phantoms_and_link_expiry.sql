-- Strip the phantom-member machinery entirely, and give invite links a 24h
-- lifetime.
--
-- Phantoms are gone (no way to create them, 0 in the DB, 0 invites reference a
-- member slot). Remove every remnant:
--   * sync_member_link trigger — mirrored a phantom's splits into personal
--     transactions when it was claimed (null->user_id). Dead now. Its other
--     branch (user_id->null on account deletion) is redundant: transactions
--     carry `on delete cascade` to auth.users, so they vanish with the account.
--   * accept_group_invite — the old token-claim RPC; nothing calls it anymore
--     (joins go through join_via_link).
--   * respond_to_invite / group_preview — drop the member_id (phantom slot)
--     handling.
--   * group_invites.member_id column + its FK.
--
-- Expiry: invite functions already gate on `expires_at > now()`, but createInvite
-- never set it. Add a 24h column default so every new link (and every targeted
-- email request) self-expires, and expire the existing immortal test links now.

-- 1. Drop the phantom-claim mirror trigger + function.
drop trigger if exists trg_member_link_sync on public.group_members;
drop function if exists public.sync_member_link();

-- 2. Drop the unused token-claim RPC.
drop function if exists public.accept_group_invite(text);

-- 3. respond_to_invite: no member_id branch; also refuse expired invites.
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record; uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.group_invites where id = p_invite;
  if inv is null or inv.invited_user_id <> uid then raise exception 'invite not found'; end if;
  if inv.accepted_at is not null or inv.declined_at is not null then raise exception 'already responded'; end if;
  if inv.expires_at is not null and inv.expires_at <= now() then raise exception 'invite expired'; end if;
  if not p_accept then
    update public.group_invites set declined_at = now() where id = inv.id;
    return null;
  end if;
  if not exists (select 1 from public.group_members where group_id = inv.group_id and user_id = uid) then
    nm := public.member_name_for(uid);
    insert into public.group_members (group_id, user_id, display_name)
      values (inv.group_id, uid, coalesce(nm, 'Member'))
    on conflict (group_id, user_id) where user_id is not null do nothing;
  end if;
  update public.group_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.group_id;
end $$;

-- 4. group_preview: drop the member_id key (column is going away).
create or replace function public.group_preview(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; result jsonb;
begin
  select * into inv from public.group_invites
    where token = p_token and (expires_at is null or expires_at > now());
  if inv is null then return null; end if;
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'currency', g.currency)
              from public.groups g where g.id = inv.group_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'display_name', m.display_name,
                  'user_id', m.user_id, 'avatar_url', p.avatar_url) order by m.created_at), '[]'::jsonb)
                from public.group_members m
                left join public.profiles p on p.id = m.user_id
                where m.group_id = inv.group_id),
    'expenses', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'description', e.description, 'amount_minor', e.amount_minor,
                  'currency', e.currency, 'paid_by', e.paid_by, 'spent_at', e.spent_at,
                  'expense_splits', (select coalesce(jsonb_agg(jsonb_build_object(
                        'member_id', s.member_id, 'share_minor', s.share_minor)), '[]'::jsonb)
                     from public.expense_splits s where s.expense_id = e.id)
                  ) order by e.spent_at desc), '[]'::jsonb)
                from public.group_expenses e where e.group_id = inv.group_id),
    'settlements', (select coalesce(jsonb_agg(jsonb_build_object(
                  'from_member', st.from_member, 'to_member', st.to_member,
                  'amount_minor', st.amount_minor) ), '[]'::jsonb)
                from public.settlements st where st.group_id = inv.group_id)
  ) into result;
  return result;
end $$;

-- 5. Drop the phantom-slot column (0 rows reference it; FK/index drop with it).
alter table public.group_invites drop column if exists member_id;

-- 6. 24h default lifetime for new invites; expire the existing immortal ones.
alter table public.group_invites alter column expires_at set default (now() + interval '24 hours');
update public.group_invites set expires_at = now() where expires_at is null;
