-- Group picture: a cover image for a group, set by the owner.

alter table public.groups add column if not exists image_url text;

-- Public bucket (group members — and invite-preview visitors — see the image).
insert into storage.buckets (id, name, public)
values ('group-images', 'group-images', true)
on conflict (id) do nothing;

drop policy if exists group_images_read on storage.objects;
create policy group_images_read on storage.objects for select
  using (bucket_id = 'group-images');

-- Only the group's owner may write. Path is `<groupId>/cover.<ext>`, so the
-- first path segment is the group id.
drop policy if exists group_images_write on storage.objects;
create policy group_images_write on storage.objects for all to authenticated
  using (bucket_id = 'group-images'
         and public.is_group_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'group-images'
         and public.is_group_owner(((storage.foldername(name))[1])::uuid));
