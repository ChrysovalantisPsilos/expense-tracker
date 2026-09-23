-- 0074: GDPR — right of access / data portability (Art. 15 and 20), and a
-- quota for the in-app privacy request form.
--
-- export_my_data() returns, as one JSON document, every piece of personal
-- data Budgeer holds about the CALLER, decrypted (the at-rest encryption of
-- 0046/0047/0050 is undone for their own rows only). It reads by auth.uid()
-- alone and takes no arguments, so it can't be pointed at anyone else.
--
-- About other people it includes only what the caller can already see in the
-- app: the names of the members of their current groups, and the group
-- expenses and settlements they are part of (paid by them, split with them,
-- or paid to/from them). Other members' user ids, emails and payment details
-- are never included; invite tokens (bearer secrets) and push endpoints are
-- redacted (a push subscription shows only its push service's host).
--
-- Rate-limited (10 an hour): it decrypts a whole account.

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); k text; res jsonb; passkeys jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.rate_limit('export:' || uid, 10, 3600) then
    raise exception 'Too many exports — please try again later.';
  end if;
  k := public.app_enc_key();

  -- Passkeys live in the auth schema; tolerate an auth version without them.
  if to_regclass('auth.webauthn_credentials') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', w.friendly_name, 'created_at', w.created_at, 'last_used_at', w.last_used_at)
               order by w.created_at), '[]'::jsonb)
        from auth.webauthn_credentials w where w.user_id = $1 $q$
      into passkeys using uid;
  end if;

  res := jsonb_build_object(
    'format', 'budgeer-personal-data',
    'format_version', 1,
    'exported_at', now(),

    'account', (select jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at,
        'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
        'sign_in_methods', coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb))
      from auth.users u where u.id = uid),
    'passkeys', passkeys,

    'profile', (select (to_jsonb(p) - 'payment_iban_enc' - 'payment_revolut_enc' - 'payment_paypal_enc')
                       || jsonb_build_object('payment_details', public.my_payment_info())
                  from public.profiles p where p.id = uid),

    'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at), '[]'::jsonb)
                   from public.consents c where c.user_id = uid),
    'inactivity_notices', (select coalesce(jsonb_agg(jsonb_build_object('warned_at', i.warned_at)), '[]'::jsonb)
                             from public.inactivity_notices i where i.user_id = uid),

    'notifications', (select coalesce(jsonb_agg(
                          to_jsonb(n) - 'user_id' - 'actor_id' - 'invite_id' order by n.created_at), '[]'::jsonb)
                        from public.notifications n where n.user_id = uid),
    'push_subscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
                               'id', s.id, 'created_at', s.created_at,
                               'push_service', split_part(split_part(s.endpoint, '://', 2), '/', 1))
                               order by s.created_at), '[]'::jsonb)
                             from public.push_subscriptions s where s.user_id = uid),

    'categories', (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at), '[]'::jsonb)
                     from public.categories c where c.user_id = uid),
    'category_rules', (select coalesce(jsonb_agg(to_jsonb(r) - 'user_id' order by r.created_at), '[]'::jsonb)
                         from public.category_rules r where r.user_id = uid),
    'accounts', (select coalesce(jsonb_agg((to_jsonb(a) - 'user_id' - 'balance_enc')
                    || jsonb_build_object('balance_minor', public.dec_minor(a.balance_enc, k))
                    order by a.created_at), '[]'::jsonb)
                   from public.accounts a where a.user_id = uid),
    'budgets', (select coalesce(jsonb_agg((to_jsonb(b) - 'user_id' - 'amount_enc')
                   || jsonb_build_object('amount_minor', public.dec_minor(b.amount_enc, k))
                   order by b.period_start, b.created_at), '[]'::jsonb)
                  from public.budgets b where b.user_id = uid),
    'savings_goals', (select coalesce(jsonb_agg((to_jsonb(g) - 'user_id' - 'target_enc' - 'saved_enc')
                         || jsonb_build_object('target_minor', public.dec_minor(g.target_enc, k),
                                               'saved_minor', public.dec_minor(g.saved_enc, k))
                         order by g.created_at), '[]'::jsonb)
                        from public.savings_goals g where g.user_id = uid),
    'recurring_rules', (select coalesce(jsonb_agg((to_jsonb(r) - 'user_id' - 'amount_enc' - 'description_enc')
                           || jsonb_build_object('amount_minor', public.dec_minor(r.amount_enc, k),
                                                 'description', public.dec_text(r.description_enc, k))
                           order by r.created_at), '[]'::jsonb)
                          from public.recurring_rules r where r.user_id = uid),
    'transactions', (select coalesce(jsonb_agg(
                        (to_jsonb(t) - 'user_id' - 'amount_enc' - 'description_enc' - 'notes_enc')
                        || jsonb_build_object('amount_minor', public.dec_minor(t.amount_enc, k),
                                              'description', public.dec_text(t.description_enc, k),
                                              'notes', public.dec_text(t.notes_enc, k))
                        order by t.spent_at, t.created_at), '[]'::jsonb)
                       from public.transactions t where t.user_id = uid),

    -- Groups the caller is in now, with what they can see of each.
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'currency', g.currency, 'created_at', g.created_at,
        'you_own_it', g.owner_id = uid,
        'your_member_id', me.id, 'your_display_name', me.display_name,
        'your_role', me.role, 'you_joined_at', me.created_at,
        'members', (select coalesce(jsonb_agg(jsonb_build_object(
                        'member_id', gm.id, 'display_name', gm.display_name, 'is_you', gm.id = me.id)
                        order by gm.created_at), '[]'::jsonb)
                      from public.group_members gm where gm.group_id = g.id),
        'expenses_you_are_part_of', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'spent_at', e.spent_at, 'currency', e.currency, 'exchange_rate', e.exchange_rate,
            'description', public.dec_text(e.description_enc, k),
            'amount_minor', public.dec_minor(e.amount_enc, k),
            'split_type', e.split_type, 'paid_by_member_id', e.paid_by, 'paid_by_you', e.paid_by = me.id,
            'your_share_minor', (select public.dec_minor(s.share_enc, k) from public.expense_splits s
                                  where s.expense_id = e.id and s.member_id = me.id limit 1),
            'added_by_you', e.created_by = uid, 'created_at', e.created_at)
            order by e.spent_at, e.created_at), '[]'::jsonb)
          from public.group_expenses e
         where e.group_id = g.id
           and (e.paid_by = me.id or exists (select 1 from public.expense_splits s
                                              where s.expense_id = e.id and s.member_id = me.id))),
        'settlements_you_are_part_of', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', st.id, 'settled_at', st.settled_at, 'currency', st.currency,
            'amount_minor', public.dec_minor(st.amount_enc, k), 'note', public.dec_text(st.note_enc, k),
            'from_member_id', st.from_member, 'to_member_id', st.to_member,
            'you_paid', st.from_member = me.id, 'recorded_by_you', st.created_by = uid,
            'created_at', st.created_at)
            order by st.settled_at, st.created_at), '[]'::jsonb)
          from public.settlements st
         where st.group_id = g.id and me.id in (st.from_member, st.to_member))
      ) order by g.created_at), '[]'::jsonb)
      from public.group_members me join public.groups g on g.id = me.group_id
     where me.user_id = uid),

    -- Groups the caller left: the member row they left behind (name only).
    'former_group_memberships', (select coalesce(jsonb_agg(jsonb_build_object(
        'member_id', m.id, 'group_id', m.group_id, 'display_name', m.display_name,
        'joined_at', m.created_at) order by m.created_at), '[]'::jsonb)
      from public.group_members m where m.former_user_id = uid and m.user_id is null),

    'group_comments_you_wrote', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'group_id', c.group_id, 'on', c.target_type, 'target_id', c.target_id,
        'body', public.dec_text(c.body_enc, k), 'created_at', c.created_at)
        order by c.created_at), '[]'::jsonb)
      from public.group_comments c where c.author_id = uid),

    'group_activity_by_you', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'group_id', l.group_id, 'action', l.action, 'name_shown', l.actor_name,
        'summary', public.dec_text(l.summary_enc, k), 'currency', l.currency,
        'amount_minor', public.dec_minor(l.amount_enc, k), 'created_at', l.created_at)
        order by l.created_at), '[]'::jsonb)
      from public.group_audit_log l where l.actor_id = uid),

    'invites_you_sent', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'group_id', i.group_id, 'invited_email', i.invited_email,
        'created_at', i.created_at, 'expires_at', i.expires_at,
        'accepted_at', i.accepted_at, 'declined_at', i.declined_at)
        order by i.created_at), '[]'::jsonb)
      from public.group_invites i where i.created_by = uid),
    'invites_you_received', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'group_id', i.group_id, 'created_at', i.created_at, 'expires_at', i.expires_at,
        'accepted_at', i.accepted_at, 'declined_at', i.declined_at)
        order by i.created_at), '[]'::jsonb)
      from public.group_invites i where i.invited_user_id = uid or i.accepted_by = uid)
  );
  return res;
end $$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- The privacy-request form (edge function privacy-request) spends the
-- caller's own 'privacy-request' quota: 3 a day. Other scopes unchanged (0058).
create or replace function public.consume_quota(p_scope text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); lim int; win int := 3600;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  lim := case p_scope
    when 'report'          then 30   -- generate-report
    when 'group-report'    then 30   -- group-report
    when 'send-invite'     then 10   -- send-invite
    when 'privacy-request' then 3    -- privacy-request (per day)
  end;
  if lim is null then raise exception 'unknown quota scope'; end if;
  if p_scope = 'privacy-request' then win := 86400; end if;
  return public.rate_limit(p_scope || ':' || uid, lim, win);
end $$;
revoke execute on function public.consume_quota(text) from public, anon;
grant execute on function public.consume_quota(text) to authenticated;
