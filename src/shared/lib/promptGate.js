// Tiny turn-taking gate for post-login prompts (passkey, notifications, …)
// so two modals never stack. Whoever opens claims the slot; waiters run when
// it's released. Single-window state — this is UX sequencing, not a lock.

let busy = false
const waiters = []

export function claimPromptSlot() {
  busy = true
}

export function releasePromptSlot() {
  busy = false
  while (waiters.length && !busy) waiters.shift()()
}

export function whenPromptSlotFree(cb) {
  if (!busy) cb()
  else waiters.push(cb)
}
