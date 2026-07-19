import { supabase } from './supabase.js'

// Update editable profile fields for the current user.
export async function updateProfile(userId, fields) {
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select().single()
  if (error) throw error
  return data
}

// Upload an avatar to the public `avatars` bucket (under the user's folder),
// save its public URL on the profile, and return the URL. Cache-busted so the
// new image shows immediately.
export async function uploadAvatar(userId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/avatar.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${file.size}`
  await updateProfile(userId, { avatar_url: url })
  return url
}
