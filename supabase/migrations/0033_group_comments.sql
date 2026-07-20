-- Comments on group items (expenses + settlements).
--
-- A thread is keyed by (group_id, target_type, target_id). Members of the group
-- can read and post; you can delete your own comments (owner can delete any).
-- A new comment notifies the other members via the existing notifications bell.

create table if not exists public.group_comments (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.groups(id) on delete cascade,
  target_type      text not null check (target_type in ('expense', 'settlement')),
  target_id        uuid not null,
  author_member_id uuid not null references public.group_members(id) on delete cascade,
  author_id        uuid not null references auth.users(id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index if not exists group_comments_target_idx
  on public.group_comments(group_id, target_id, created_at);

alter table public.group_comments enable row level security;

-- Members read the whole group's comments.
create policy gc_select on public.group_comments for select to authenticated
  using (public.is_group_member(group_id) or public.is_group_owner(group_id));

-- Insert only as yourself, and author_member_id must be YOUR member row in this
-- group (prevents posting under someone else's name).
create policy gc_insert on public.group_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.group_members m
      where m.id = group_comments.author_member_id
        and m.group_id = group_comments.group_id
        and m.user_id = auth.uid()
    )
  );

-- Delete your own; the owner can delete any (moderation).
create policy gc_delete on public.group_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_group_owner(group_id));

grant select, insert, delete on public.group_comments to authenticated;

-- Notify co-members (except the author) on a new comment.
create or replace function public.notify_group_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare gname text; actor text; item text;
begin
  select name into gname from public.groups where id = NEW.group_id;
  select coalesce(display_name, 'Someone') into actor from public.profiles where id = NEW.author_id;
  if NEW.target_type = 'expense' then
    select coalesce(description, 'an expense') into item from public.group_expenses where id = NEW.target_id;
  else
    item := 'a settlement';
  end if;
  insert into public.notifications (user_id, type, title, body, group_id, actor_id)
  select m.user_id, 'comment', coalesce(gname, 'Group') || ': new comment',
         actor || ' commented on ' || coalesce(item, 'an item'),
         NEW.group_id, NEW.author_id
  from public.group_members m
  where m.group_id = NEW.group_id and m.user_id is not null and m.user_id <> NEW.author_id;
  return NEW;
end $$;
revoke execute on function public.notify_group_comment() from anon, authenticated, public;

drop trigger if exists trg_notify_comment on public.group_comments;
create trigger trg_notify_comment after insert on public.group_comments
  for each row execute function public.notify_group_comment();

-- Comment counts per item for the group (drives the row badge). Membership-
-- guarded, so a non-member gets nothing.
create or replace function public.group_comment_counts(p_group uuid)
returns table (target_id uuid, n bigint)
language sql stable security definer set search_path = public as $$
  select c.target_id, count(*)
  from public.group_comments c
  where c.group_id = p_group
    and (public.is_group_member(p_group) or public.is_group_owner(p_group))
  group by c.target_id;
$$;
revoke execute on function public.group_comment_counts(uuid) from anon, public;
grant execute on function public.group_comment_counts(uuid) to authenticated;
