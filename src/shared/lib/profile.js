import { supabase } from './supabase.js'
import { dbError, edgeFunctionError } from './errors.js'

// Profile and account data access (shared: settings, onboarding, backup and
// the ProfileProvider all use it).

// Read a profile row for a user. `columns` narrows the select to just the
// fields a caller needs (defaults to the whole row). Null if missing; throws
// on a failed read (the ProfileProvider shows an error for that).
export async function fetchProfile(userId, columns = '*') {
  const { data, error } = await supabase.from('profiles').select(columns).eq('id', userId).maybeSingle()
  if (error) throw dbError(error)
  return data ?? null
}

// Best-effort variant for screens that just prefill a form: null on any failure.
export async function getProfile(userId, columns = '*') {
  try { return await fetchProfile(userId, columns) } catch { return null }
}

// Payment details (IBAN/Revolut/PayPal.me) are stored ENCRYPTED at rest (pgcrypto + a key
// in Supabase Vault) — there are no plaintext columns to select, so read/write
// goes through these definer RPCs, which decrypt/encrypt for the owner only.
export async function getMyPaymentInfo() {
  const { data, error } = await supabase.rpc('my_payment_info')
  if (error) throw dbError(error)
  return data ?? {}
}

// Persist payment details (pass already-normalized strings, or null to clear).
// `paypal` left undefined keeps the stored PayPal.me name (callers that only
// know IBAN/Revolut); null or '' clears it.
export async function savePaymentInfo({ iban, revolut, paypal }) {
  const { error } = await supabase.rpc('set_payment_info', {
    p_iban: iban || null,
    p_revolut: revolut || null,
    ...(paypal !== undefined ? { p_paypal: paypal || '' } : {}),
  })
  if (error) throw dbError(error)
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

// Permanently delete the signed-in account (the edge function deletes only the
// caller). Password users must pass their password: the server re-verifies it.
export async function deleteMyAccount({ password } = {}) {
  const body = password != null ? { password } : {}
  const { error } = await supabase.functions.invoke('delete-account', { body })
  if (error) throw await edgeFunctionError(error)
}
