// Which Supabase RPC calls are read-only and safe to serve from the offline
// cache, and the cache key for one. Ledger reads go through decrypting RPCs
// (POST /rest/v1/rpc/<fn>), which the Cache API can't store by method, so the
// service worker files each response under a synthetic GET key. Only this
// allowlist is cached: writes must never be replayed from a cache.
import { jwtClaims } from '../../../supabase/functions/_shared/reauth.ts'

const OFFLINE_READ_RPCS = new Set([
  'my_transactions', 'my_recurring_rules', 'my_budgets', 'my_accounts', 'my_goals',
  'my_payment_info', 'list_my_group_invites',
  'group_ledger', 'group_balances', 'group_audit_entries', 'group_comments_for',
  'group_comment_counts', 'group_member_avatars', 'member_payment_info',
  // The statements made on the device read the latest ECB rates for foreign
  // yearly rules (public reference data, nothing per user).
  'latest_fx_rates',
])

// The RPC name for a cacheable read, or null. `pathname` like
// "/rest/v1/rpc/my_transactions".
export function offlineReadRpc(method, pathname) {
  if (method !== 'POST') return null
  const m = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(pathname)
  return m && OFFLINE_READ_RPCS.has(m[1]) ? m[1] : null
}

// Stable key for one call: same function + same arguments + same signed-in
// user → same entry, so two accounts on one device never share cached reads.
// `identity` is the user id (see requestUser), not the token, which rotates
// hourly and would orphan everything cached before the refresh.
export function offlineReadKey(origin, rpc, body, identity) {
  const params = new URLSearchParams({ body, who: identity })
  return `${origin}/__offline-rpc/${rpc}?${params}`
}

// The user id (JWT `sub`) from an "Authorization: Bearer <jwt>" header, or ''
// when absent/unreadable. Only used to partition the local cache, so the
// signature isn't checked here (the server verifies it on every request).
export function requestUser(authorization) {
  if (!/^Bearer /.test(authorization ?? '')) return ''
  return String(jwtClaims(authorization)?.sub ?? '')
}
