// Privacy data layer: legal-document acceptance, the consent history, the
// personal-data export (Art. 15/20) and the privacy request form. Every call
// is scoped to the signed-in user by the database (RLS / auth.uid()).
import { supabase } from '../../shared/lib/supabase.js'
import { saveBlob } from '../../shared/lib/download.js'
import { exportFileName } from './legal.js'
import { dbError, edgeFunctionError } from '../../shared/lib/errors.js'

// { privacy_version, terms_version, privacy_accepted, terms_accepted, needs_acceptance }
export async function getLegalStatus() {
  const { data, error } = await supabase.rpc('my_legal_status')
  if (error) throw dbError(error)
  return data
}

// Accept the versions in force (the server records its own versions + time).
export async function acceptLegalDocuments() {
  const { data, error } = await supabase.rpc('accept_legal_documents')
  if (error) throw dbError(error)
  return data
}

// The signed-in user's consent and preference history, newest first.
export async function listMyConsents() {
  const { data, error } = await supabase
    .from('consents')
    .select('id, purpose, version, granted, source, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw dbError(error)
  return data ?? []
}

// Everything Budgeer holds about the signed-in user, decrypted, saved as JSON.
export async function downloadMyData() {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw dbError(error)
  const text = JSON.stringify(data, null, 2)
  saveBlob(new Blob([text], { type: 'application/json' }), exportFileName())
}

// Forward a privacy request ({ kind, message }) to the privacy inbox.
export async function sendPrivacyRequest(request) {
  const { error } = await supabase.functions.invoke('privacy-request', { body: request })
  if (error) throw await edgeFunctionError(error)
}
