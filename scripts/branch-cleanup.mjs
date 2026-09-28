// Deletes remote branches whose work is already in develop. Run by
// .github/workflows/branch-cleanup.yml (on every push to develop, daily, or
// by hand with a dry run); `DRY_RUN=1 node scripts/branch-cleanup.mjs` lists
// what it would delete without deleting anything.
//
// A branch goes only when all of these hold (branchesToDelete, tested in
// test/branchCleanup.test.js):
//   - it isn't main, develop or a keep/… branch;
//   - its tip is already in develop (nothing on it would be lost);
//   - its tip isn't develop's own tip (a branch just made from develop, with
//     no commits yet, would otherwise vanish before anyone used it);
//   - its last commit is at least a day old (a grace period for the same).
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const PROTECTED = ['main', 'develop', 'HEAD']
export const KEEP_PREFIX = 'keep/'
export const MIN_AGE_MS = 24 * 60 * 60 * 1000

// branches: [{ name, sha, merged, committedAt (ms) }] → the names to delete.
export function branchesToDelete(branches, { developSha, now, minAgeMs = MIN_AGE_MS }) {
  return branches
    .filter((b) => !PROTECTED.includes(b.name) && !b.name.startsWith(KEEP_PREFIX))
    .filter((b) => b.merged && b.sha !== developSha)
    .filter((b) => Number.isFinite(b.committedAt) && now - b.committedAt >= minAgeMs)
    .map((b) => b.name)
    .sort()
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function isAncestor(sha, ref) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, ref])
    return true
  } catch {
    return false
  }
}

function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
  git('fetch', '--prune', 'origin')
  const developSha = git('rev-parse', 'origin/develop')
  const branches = git('for-each-ref', 'refs/remotes/origin', '--format=%(refname:lstrip=3) %(objectname) %(committerdate:unix)')
    .split('\n').filter(Boolean)
    .map((line) => {
      const [name, sha, ts] = line.split(' ')
      return { name, sha, committedAt: Number(ts) * 1000, merged: isAncestor(sha, 'origin/develop') }
    })
  const doomed = branchesToDelete(branches, { developSha, now: Date.now() })
  if (!doomed.length) {
    console.log('No merged branches to delete.')
    return
  }
  for (const name of doomed) {
    if (dryRun) {
      console.log(`Would delete ${name}`)
    } else {
      git('push', 'origin', '--delete', name)
      console.log(`Deleted ${name}`)
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
