-- Storage buckets + policies as code. These were originally created in the
-- dashboard on the first project; codified so every environment (prod, test,
-- future previews) gets identical storage from migrations alone.

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('group-images', 'group-images', true),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Own-folder write access (folder name = auth.uid()).
drop policy if exists "avatars_write" on storage.objects;
create policy "avatars_write" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "own receipts" on storage.objects;
create policy "own receipts" on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (auth.uid())::text);

-- Group images: anyone can view; only the group's owner writes (folder = group id).
drop policy if exists "group_images_read" on storage.objects;
create policy "group_images_read" on storage.objects for select
  using (bucket_id = 'group-images');

drop policy if exists "group_images_write" on storage.objects;
create policy "group_images_write" on storage.objects for all to authenticated
  using (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'group-images' and public.is_group_owner(((storage.foldername(name))[1])::uuid));
