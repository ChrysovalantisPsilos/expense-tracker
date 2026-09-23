-- L3 follow-up to 0058: Google sign-ups get profiles.avatar_url from Google
-- (https://lh3.googleusercontent.com/…, copied by handle_new_user), and a
-- client may write that URL back (e.g. a profile restore). So a client-set
-- avatar may point at this project's own avatars/<uid>/ folder OR at a
-- *.googleusercontent.com image over https. Group covers stay own-storage only.
-- Existing values are never re-checked (only changed values are).

create or replace function public.image_url_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare v text; old_v text; prefix text;
begin
  if current_user not in ('anon', 'authenticated') then return NEW; end if;
  if TG_TABLE_NAME = 'profiles' then
    v := NEW.avatar_url; old_v := OLD.avatar_url;
    prefix := public.storage_public_base() || 'avatars/' || NEW.id || '/';
  else
    v := NEW.image_url; old_v := OLD.image_url;
    prefix := public.storage_public_base() || 'group-images/' || NEW.id || '/';
  end if;
  if v is null or v is not distinct from old_v then return NEW; end if;
  if v ~ '\.\.' or v ~ '[[:space:]]' then
    raise exception using errcode = '23514', message = 'Images must be uploaded to Budgeer.';
  end if;
  if prefix is not null and left(v, char_length(prefix)) = prefix then return NEW; end if;
  -- Host must end the authority part: no userinfo, no port, no look-alike suffix.
  if TG_TABLE_NAME = 'profiles' and v ~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/' then
    return NEW;
  end if;
  raise exception using errcode = '23514', message = 'Images must be uploaded to Budgeer.';
end $$;
revoke execute on function public.image_url_guard() from public, anon, authenticated;
