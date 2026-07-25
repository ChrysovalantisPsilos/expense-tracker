import { supabase } from '../../shared/lib/supabase.js'

// Read a profile row for a user. `columns` narrows the select to just the
// fields a caller needs (defaults to the whole row). Returns null if missing.
export async function getProfile(userId, columns = '*') {
  const { data } = await supabase.from('profiles').select(columns).eq('id', userId).single()
  return data ?? null
}

// Payment details (IBAN/Revolut) are stored ENCRYPTED at rest (pgcrypto + a key
// in Supabase Vault) — there are no plaintext columns to select, so read/write
// goes through these definer RPCs, which decrypt/encrypt for the owner only.
export async function getMyPaymentInfo() {
  const { data, error } = await supabase.rpc('my_payment_info')
  if (error) throw new Error(error.message)
  return data ?? {}
}

// Persist payment details (pass already-normalized strings, or null to clear).
export async function savePaymentInfo({ iban, revolut }) {
  const { error } = await supabase.rpc('set_payment_info', {
    p_iban: iban || null,
    p_revolut: revolut || null,
  })
  if (error) throw new Error(error.message)
}

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
