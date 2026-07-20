// Offline write queue for single-user expense logging.
//
// Strategy (safe because a user only ever writes their OWN rows — no
// cross-user conflicts): every create/update is stamped with a client_uuid
// and enqueued in IndexedDB. When online, we flush the queue to Supabase.
// The `transactions.client_uuid` UNIQUE constraint makes re-sends idempotent,
// so a flush that partially fails can be retried without creating duplicates.
//
// Reads still go straight to Supabase (cached by the service worker's
// NetworkFirst rule), so offline reads show the last-synced data.

import { openDB } from 'idb'
import { supabase } from '../../shared/lib/supabase.js'

const DB_NAME = 'expense-tracker'
const STORE = 'outbox'

function uuid() {
  return crypto.randomUUID()
}

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'client_uuid' })
      }
    },
  })
}

// Enqueue a transaction (expense or income). Returns the client_uuid.
// Awaits the flush so that when online, callers who reload() right after see
// the committed row (the record is already persisted in IndexedDB first, so a
// flush failure/offline still leaves it safely queued for a later retry).
export async function queueTransaction(row) {
  const record = {
    client_uuid: row.client_uuid ?? uuid(),
    table: 'transactions',
    op: 'upsert',
    payload: { ...row },
    queued_at: Date.now(),
  }
  record.payload.client_uuid = record.client_uuid
  const d = await db()
  await d.put(STORE, record)
  await flushQueue().catch(() => {})
  return record.client_uuid
}

// Enqueue an edit of an existing transaction (by id). Idempotent on re-send.
export async function queueTransactionUpdate(id, fields) {
  const d = await db()
  await d.put(STORE, {
    client_uuid: uuid(), table: 'transactions', op: 'update',
    targetId: id, payload: { ...fields }, queued_at: Date.now(),
  })
  await flushQueue().catch(() => {})
}

// Enqueue a delete of an existing transaction (by id). Idempotent on re-send.
export async function queueTransactionDelete(id) {
  const d = await db()
  await d.put(STORE, {
    client_uuid: uuid(), table: 'transactions', op: 'delete',
    targetId: id, queued_at: Date.now(),
  })
  await flushQueue().catch(() => {})
}

export async function pendingCount() {
  const d = await db()
  return d.count(STORE)
}

// Serialize flushes: concurrent callers (the sync interval, reconnect, and a
// just-queued write all racing) chain onto one another instead of the extra
// callers short-circuiting out. That guarantees a caller who awaits flushQueue
// after enqueuing its record gets a flush that actually included that record —
// which is what lets the UI reload() and see the new row without a refresh.
let flushChain = Promise.resolve({ flushed: 0, remaining: 0 })

export function flushQueue() {
  flushChain = flushChain.catch(() => {}).then(() => runFlush())
  return flushChain
}

async function runFlush() {
  if (!navigator.onLine) return { flushed: 0, remaining: await pendingCount() }
  let flushed = 0
  const d = await db()
  const all = (await d.getAll(STORE)).sort((a, b) => (a.queued_at ?? 0) - (b.queued_at ?? 0))
  for (const record of all) {
    let error
    if (record.op === 'delete') {
      ({ error } = await supabase.from(record.table).delete().eq('id', record.targetId))
    } else if (record.op === 'update') {
      ({ error } = await supabase.from(record.table).update(record.payload).eq('id', record.targetId))
    } else {
      ({ error } = await supabase.from(record.table)
        .upsert(record.payload, { onConflict: 'user_id,client_uuid' }))
    }
    if (error) {
      // Stop on first error (likely offline / auth); keep the rest queued.
      break
    }
    await d.delete(STORE, record.client_uuid)
    flushed += 1
  }
  return { flushed, remaining: await pendingCount() }
}

// Wire up auto-flush on reconnect. Call once at app start.
export function initSync() {
  window.addEventListener('online', () => {
    flushQueue().catch(() => {})
  })
  // Also try on load in case we came back while closed.
  flushQueue().catch(() => {})
}
