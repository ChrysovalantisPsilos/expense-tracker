import { supabase } from './supabase.js'

// Upload a receipt image to the private `receipts` bucket under the user's
// own folder ("<user_id>/<timestamp>-<rand>.<ext>"), returning the stored path
// (which we save on the transaction). RLS ensures only the owner can read it.
export async function uploadReceipt(userId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const rand = crypto.randomUUID().slice(0, 8)
  const path = `${userId}/${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from('receipts').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

// Create a short-lived signed URL to view a stored receipt (bucket is private).
export async function receiptUrl(path, expiresIn = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, expiresIn)
  if (error) return null
  return data.signedUrl
}
