import { useEffect, useMemo } from 'react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useLiveQuery } from '../../shared/lib/db.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'
import { liveQueryCache, queryCacheKey } from '../../shared/lib/queryCache.js'
import { listGroups, listGroupSummaries } from './groups.js'
import { byRecent, memberGroups, withRecent } from './quickAddMath.js'

// The groups this device last added a shared expense to, newest first (a
// per-device convenience: only group ids). Unreadable storage is an empty list.
function recentGroupIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentGroups) || '[]')
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

// Note that the user just added an expense to group `id`, so the Add form
// offers it first next time.
export function rememberGroup(id) {
  try {
    localStorage.setItem(STORAGE_KEYS.recentGroups, JSON.stringify(withRecent(recentGroupIds(), id)))
  } catch { /* storage unavailable: the order just isn't remembered */ }
}

// The viewer's groups for the Add form's "Who's it for?" row: only groups
// they're a member of, each with its members (+avatars), most recently used
// first, then newest first. Live: joining, leaving or a new group updates the
// row. The last answer is cached for this page load, so opening Add again
// shows the row at once instead of pushing the form down when it arrives.
// `enabled: false` (editing an entry) reads nothing. Returns { groups, loading }.
export function useMyGroups({ enabled = true } = {}) {
  const { user } = useAuth()
  const uid = user?.id
  const on = enabled && !!uid
  const { data, loading } = useLiveQuery(() => readMyGroups(uid), {
    key: 'my-groups',
    specs: [{ table: 'groups' }, { table: 'group_members' }],
    deps: [uid],
    enabled: on,
    initial: [],
    cacheKey: on ? myGroupsKey(uid) : null,
  })
  const groups = useMemo(() => byRecent(data ?? [], recentGroupIds()), [data])
  return { groups, loading: on && loading }
}

const myGroupsKey = (uid) => queryCacheKey('my-groups', [uid])

// The viewer's groups with their members: one request for the groups, and
// only when there are any, one for their members plus an avatars call each.
async function readMyGroups(uid) {
  const groups = await listGroups()
  const summaries = await listGroupSummaries(groups.map((g) => g.id), { balances: false })
  return memberGroups(groups, summaries, uid)
}

// Home warms the Add form's "Who's it for?" row once `ready` (its own first
// read has answered, so this never competes with it): a one-shot read into
// useMyGroups' cache key, so the chips are there the moment Add opens instead
// of popping in. No subscription of its own (useMyGroups keeps the row live
// once Add is open), nothing when the cache already has an answer, and a
// user with no groups costs the single groups request.
export function usePrefetchMyGroups(ready = true) {
  const { user } = useAuth()
  const uid = user?.id
  useEffect(() => {
    if (ready && uid) liveQueryCache.prefetch(myGroupsKey(uid), () => readMyGroups(uid))
  }, [ready, uid])
}
