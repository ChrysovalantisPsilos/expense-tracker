// Pure rules for adding a group expense from the main Add form ("Who's it
// for?"): which groups it offers and in what order, what carries over when
// the user switches between "Just me" and a group, and which ?group= link is
// honoured. No I/O: myGroups.js reads and writes the device's list.
import { CURRENCIES, minorFactor, minorToInput, toMinor } from '../../shared/lib/currency.js'
import { t } from '../../shared/lib/i18n/i18n.js'

// How many recently used groups the device remembers.
export const RECENT_MAX = 20

// The groups the viewer can add to: the ones they're a member of (a group
// can be visible without that, e.g. while an invite is open), each with its
// members (listGroupSummaries' Map<groupId, { members }>). A group whose
// members didn't load isn't offered: without them there's no payer or split.
export function memberGroups(groups, summaries, userId) {
  return (groups ?? []).flatMap((g) => {
    const members = summaries?.get(g.id)?.members
    return members?.some((m) => m.user_id === userId) ? [{ ...g, members }] : []
  })
}

// Most recently used first (in the order of `recent`, newest first), then the
// rest newest first (created_at). Never mutates its inputs.
export function byRecent(groups, recent = []) {
  const rank = new Map(recent.map((id, i) => [id, i]))
  const at = (g) => (rank.has(g.id) ? rank.get(g.id) : Infinity)
  return [...(groups ?? [])].sort((a, b) =>
    at(a) - at(b) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}

// The recently used list after adding to group `id`: it moves to the front,
// and the list keeps at most RECENT_MAX ids. Anything that isn't a list of
// strings (a hand-edited or corrupt entry) starts a fresh list.
export function withRecent(recent, id, max = RECENT_MAX) {
  const ids = Array.isArray(recent) ? recent.filter((x) => typeof x === 'string') : []
  return [id, ...ids.filter((x) => x !== id)].slice(0, max)
}

// A ?group= link picks that group only when it's one of the viewer's own;
// anything else (a stale link, someone else's group) is ignored.
export function validGroupParam(param, groups) {
  return param && (groups ?? []).some((g) => g.id === param) ? param : null
}

// What the Add form carries into the other side when the user switches
// between "Just me" and a group (or a group and another group): the typed
// amount, description and date as they are, and the currency the user picked
// (`currencyPicked`). An untouched currency is just that side's default, so it
// becomes the new side's default (`toDefault`: the base currency for "Just
// me", the group's currency for a group). The amount keeps its value but is
// written with the new currency's decimals (84.60 → 85 in yen). `null` (no
// draft yet) stays null.
export function carryDraft(draft, toDefault) {
  if (!draft) return null
  const keep = draft.currencyPicked && draft.currency &&
    (CURRENCIES.includes(draft.currency) || draft.currency === toDefault)
  const currency = keep ? draft.currency : toDefault
  const amount = draft.amount && Number(draft.amount) > 0 && draft.currency &&
    minorFactor(draft.currency) !== minorFactor(currency)
    ? minorToInput(toMinor(draft.amount, currency), currency)
    : draft.amount ?? ''
  return { ...draft, currency, currencyPicked: !!keep, amount }
}

// Who a split covers, for the collapsed split card: "All 4", or "3 of 4".
export function splitCountLabel(included, total) {
  return included === total
    ? t('groups:splitCount.all', { total })
    : t('groups:splitCount.some', { included, total })
}
