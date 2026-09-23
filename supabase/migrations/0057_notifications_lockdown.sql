-- Hotfix: clients could insert notifications for themselves (notif_insert on
-- TEST since 0052; notif_own FOR ALL on older schemas), and every insert fans
-- out to web push and, for some types, email via notify-user — an unthrottled
-- abuse path (CLAUDE.md rule 6). Only definer functions/triggers create
-- notifications, and the client only marks them read. So: no client INSERT,
-- and UPDATE limited to read_at. Works on both the 0047 and 0056 schemas.
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists notif_insert on public.notifications;
