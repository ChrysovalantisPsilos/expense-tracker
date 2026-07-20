import { supabase } from '../../shared/lib/supabase.js'

// Direct writes to the transactions table. Login is required (and reads are
// served from the service-worker cache when offline), so there's no offline
// write queue — a write that can't reach the server just fails and the caller
// shows an offline-aware toast.
//
// Inserts still carry a client_uuid and upsert on (user_id, client_uuid): if a
// submit's response is lost but the row actually landed, retrying the same
// submit updates that row instead of creating a duplicate. Callers keep the
// client_uuid stable across retries of one submit and rotate it after success.
export async function insertTransaction(row) {
  const client_uuid = row.client_uuid ?? crypto.randomUUID()
  const { error } = await supabase
    .from('transactions')
    .upsert({ ...row, client_uuid }, { onConflict: 'user_id,client_uuid' })
  if (error) throw new Error(error.message)
}

export async function updateTransaction(id, fields) {
  const { error } = await supabase.from('transactions').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
