// The group pages' parts (groupFormat.js), shared by the web's components
// and the native app: the rows the server sends, the groups list's cards,
// the balances card, the history's rows, the members, the comments.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activityParts, avatarStackParts, deleteNameMatches, balancesFrom, balancesParts, commentCountsFrom, commentParts, expenseRowParts,
  groupCardParts, groupShareText, memberAvatar, groupViewer, inviteLink, inviteToken, joinParts, inviteRowParts, inviteRefusal, memberRowParts, membersWithAvatars, settlementRowParts,
  stillInNames,
} from '../src/features/groups/groupFormat.js'
import { avatarColor } from '../src/shared/ui/avatarLook.js'
import { groupColour } from '../src/features/groups/groupCover.js'

const NOW = new Date('2026-09-20T12:00:00Z')
const MEMBERS = [
  { id: 'm1', user_id: 'u1', role: 'owner', display_name: 'Alex', avatar_url: null },
  { id: 'm2', user_id: 'u2', role: 'member', display_name: 'Sofia', avatar_url: 'https://x/s.png' },
  { id: 'm3', user_id: null, role: 'member', display_name: 'Anna', avatar_url: null },
]

test('the server\'s rows as the pages read them: balances, comment counts, avatars, viewer, invite link', () => {
  assert.deepEqual([...balancesFrom([{ member_id: 'm1', net_minor: '1500' }])], [['m1', 1500]])
  assert.deepEqual([...commentCountsFrom([{ target_id: 'e1', n: '3' }])], [['e1', 3]])
  assert.deepEqual(balancesFrom(null).size, 0)
  const joined = membersWithAvatars([{ id: 'm1', user_id: 'u1' }, { id: 'm3', user_id: null }],
    [{ user_id: 'u1', avatar_url: 'https://x/a.png' }])
  assert.deepEqual(joined.map((m) => m.avatar_url), ['https://x/a.png', null])
  assert.deepEqual(groupViewer({ owner_id: 'u1' }, MEMBERS, 'u1'), { myMember: MEMBERS[0], isOwner: true })
  assert.deepEqual(groupViewer({ owner_id: 'u1' }, MEMBERS, 'u9'), { myMember: null, isOwner: false })
  assert.deepEqual(groupViewer(null, null, null), { myMember: null, isOwner: false })
  assert.equal(inviteLink('https://dev.budgeer.com', 'tok'), 'https://dev.budgeer.com/join/tok')
})

test('inviteToken: the token in a pasted join link, the app\'s link or on its own', () => {
  const token = 'a1b2c3d4e5f6a7b8c9'
  for (const text of [
    `https://www.budgeer.com/join/${token}`, `https://dev.budgeer.com/join/${token}/`, `budgeer.com/join/${token}`,
    `  http://budgeer.com/join/${token}?utm=x  `, `budgeer://join/${token}`, `BUDGEER://join/${token}#top`, token,
    inviteLink('https://dev.budgeer.com', token),
  ]) assert.equal(inviteToken(text), token, text)
  for (const text of [
    '', null, 'abc', 'https://example.com/join/abc123', `https://www.budgeer.com/groups/${token}`,
    `budgeer://auth-callback#${token}`, 'two words here', `https://budgeer.com/join/`,
  ]) assert.equal(inviteToken(text), null, String(text))
})

test('joinParts: the join page from preview_link_invite\'s answer', () => {
  assert.deepEqual(joinParts({ status: 'already_member', group_id: 'g1' }), { status: 'open', groupId: 'g1' })
  assert.deepEqual(joinParts({ status: 'invalid' }), { status: 'invalid' })
  assert.deepEqual(joinParts(null), { status: 'invalid' })
  const parts = joinParts({
    status: 'joinable',
    preview: { group: { name: 'Lisbon', image_url: null }, member_count: 2, members: MEMBERS.slice(0, 2) },
  })
  assert.equal(parts.status, 'joinable')
  assert.equal(parts.name, 'Lisbon')
  assert.equal(parts.imageUrl, null)
  assert.deepEqual(parts.colour, groupColour('Lisbon'))
  assert.deepEqual(parts.members, [memberAvatar(MEMBERS[0], false), memberAvatar(MEMBERS[1], false)])
  const bare = joinParts({ status: 'joinable', preview: { group: { name: '', image_url: 'https://x/c.png' } } })
  assert.equal(bare.name, 'Group invite')
  assert.equal(bare.imageUrl, 'https://x/c.png')
  assert.deepEqual(bare.members, [])
})

test('avatarStackParts / groupCardParts: the groups list\'s card', () => {
  const stack = avatarStackParts(MEMBERS, 'u2')
  assert.deepEqual(stack.shown.map((a) => `${a.id}:${a.initials}:${a.highlight}`), ['m2:S:true', 'm1:A:false', 'm3:A:false'])
  assert.equal(stack.shown[1].bg, avatarColor('Alex'))
  assert.equal(stack.overflow, 0)
  assert.deepEqual(memberAvatar(MEMBERS[1], true), { id: 'm2', ...stack.shown[0] })
  const group = { id: 'g1', name: 'Lisbon', currency: 'EUR', image_url: null, group_members: [{ count: 3 }] }
  const summary = { members: MEMBERS, balances: new Map([['m1', 2500], ['m2', -2500]]) }
  const card = groupCardParts(group, summary, 'u1')
  assert.equal(card.members, '3 members')
  assert.equal(card.initials, 'L')
  assert.deepEqual(card.colour, groupColour('g1'))
  assert.equal(groupCardParts({ ...group, name: 'Flat 3B' }, summary, 'u1').initials, 'F3')
  assert.equal(groupCardParts({ ...group, name: 'Lisbon trip' }, summary, 'u1').initials, 'LT')
  assert.deepEqual(card.balance, { label: 'You’re owed', amount: '€25.00', tone: 'positive' })
  assert.deepEqual(groupCardParts(group, summary, 'u2').balance, { label: 'You owe', amount: '€25.00', tone: 'negative' })
  // Without its summary: the count from the groups query, no stack or balance.
  const bare = groupCardParts(group, undefined, 'u1')
  assert.deepEqual([bare.members, bare.avatars, bare.balance], ['3 members', null, null])
})

test('balancesParts: your balance, everyone\'s, the line that matters, the plan', () => {
  const balances = new Map([['m1', 3000], ['m2', -1000], ['m3', -2000]])
  const p = balancesParts({ balances, members: MEMBERS, myMember: MEMBERS[1], myUserId: 'u2', currency: 'EUR' })
  assert.deepEqual(p.mine, { text: '−€10.00', tone: 'negative' })
  assert.deepEqual(p.tiles.map((b) => `${b.label}:${b.text}:${b.tone}`), ['You:−€10.00:negative', 'Alex:+€30.00:positive', 'Anna:−€20.00:negative'])
  assert.deepEqual(p.highlight, { text: 'You owe Alex', amount: '€10.00', tone: 'negative' })
  // Each tile's avatar (the viewer's in the accent) and its bar against the biggest balance.
  assert.deepEqual(p.tiles.map((b) => [b.avatar.id, b.avatar.initials, b.avatar.highlight, b.bar]),
    [['m2', 'S', true, 1 / 3], ['m1', 'A', false, 1], ['m3', 'A', false, 2 / 3]])
  assert.equal(p.planSubtitle, '2 payments to settle everyone up')
  const mine = p.plan.find((x) => x.from.id === 'm2')
  assert.deepEqual([mine.from.name, mine.from.highlight, mine.from.src, mine.to.name, mine.amount, mine.tone],
    ['You', true, 'https://x/s.png', 'Alex', '€10.00', 'negative'])
  // "You" in words, your own initials in the circle.
  assert.deepEqual([mine.from.initials, mine.from.avatarName, mine.to.initials], ['S', 'Sofia', 'A'])
  // Settled, or alone in the group: no tiles, no plan.
  const alone = balancesParts({ balances: new Map(), members: MEMBERS.slice(0, 1), myMember: MEMBERS[0], myUserId: 'u1', currency: 'EUR' })
  assert.deepEqual([alone.mine, alone.tiles, alone.plan, alone.planSubtitle],
    [{ text: '€0.00', tone: 'muted' }, [], [], null])
  assert.deepEqual(alone.highlight, { text: 'You’re all settled up', amount: null, tone: null })
})

test('expenseRowParts / settlementRowParts / activityParts: the history\'s rows', () => {
  const expense = {
    id: 'e1', description: 'Dinner', amount_minor: 4250, currency: 'GBP', group_amount_minor: 4972,
    paid_by: 'm1', spent_at: '2026-09-08', created_by: 'u2', split_type: 'equal',
    expense_splits: [{ member_id: 'm1' }, { member_id: 'm2' }],
  }
  const options = { members: MEMBERS, myMemberId: 'm2', myUserId: 'u2', isOwner: false, currency: 'EUR', counts: new Map([['e1', 2]]), now: NOW }
  assert.deepEqual(expenseRowParts(expense, options), {
    id: 'e1', title: 'Dinner',
    meta: [{ text: 'Paid by Alex', phone: true }, { text: '8 Sep', phone: true }, { text: 'split 2 ways', phone: true }],
    amount: '£42.50', amountMeta: '≈ €49.72', comments: 2, canEdit: true,
  })
  const own = expenseRowParts({ ...expense, currency: 'EUR', created_by: 'u1', expense_splits: MEMBERS.map((m) => ({ member_id: m.id })) },
    { ...options, counts: undefined })
  assert.deepEqual([own.amountMeta, own.comments, own.canEdit, own.meta[2].phone], [null, 0, false, false])
  assert.equal(expenseRowParts(expense, { ...options, myUserId: 'u1', isOwner: true }).canEdit, true)
  assert.deepEqual(settlementRowParts({ id: 's1', from_member: 'm2', to_member: 'm1', amount_minor: 1000, currency: 'EUR', settled_at: '2025-12-30' },
    { members: MEMBERS, myMemberId: 'm2', now: NOW }), { id: 's1', title: 'You → Alex', meta: '30 Dec 2025', amount: '€10.00', comments: 0 })
  const log = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, summary: `Entry ${i}`, created_at: '2026-09-19T14:05:00Z', amount_minor: i ? 100 : null, currency: i === 1 ? 'USD' : null }))
  const rows = activityParts(log, 'EUR', NOW)
  assert.equal(rows.length, 25)
  assert.deepEqual(rows.slice(0, 3).map((r) => r.amount), [null, '$1.00', '€1.00'])
  assert.equal(rows[0].text, 'Entry 0')
})

test('memberRowParts / inviteRefusal / stillInNames: the Members page', () => {
  const rows = memberRowParts(MEMBERS, 'u2', false)
  assert.deepEqual(rows.map((r) => `${r.label}|${r.owner}|${r.canRemove}|${r.highlight}`),
    ['Sofia (you)|null|false|true', 'Alex|Owner|false|false', 'Anna|null|false|false'])
  assert.deepEqual(memberRowParts(MEMBERS, 'u1', true).map((r) => r.canRemove), [false, true, true])
  assert.equal(memberRowParts(MEMBERS, 'u1', true)[1].removeLabel, 'Remove Sofia')
  assert.equal(inviteRefusal('already_member'), 'That person is already in this group.')
  assert.equal(inviteRefusal('already_invited'), 'They already have a pending invite to this group.')
  assert.equal(inviteRefusal('rate_limited'), 'Couldn’t send the invite.')
  assert.equal(stillInNames(MEMBERS.slice(1)), 'Sofia, Anna')
  assert.equal(deleteNameMatches(' Lisbon ', 'Lisbon'), true)
  assert.equal(deleteNameMatches('lisbon', 'Lisbon'), false)
})

test('commentParts: who, when, the text, and only your own can go', () => {
  const cm = { id: 'c1', body: 'Thanks!', created_at: '2026-09-19T14:05:00Z', author_id: 'u2', author: { display_name: 'Sofia' } }
  const parts = commentParts(cm, 'u2', NOW)
  assert.deepEqual([parts.author, parts.initials, parts.body, parts.canDelete], ['Sofia', 'S', 'Thanks!', true])
  assert.equal(commentParts(cm, 'u1', NOW).canDelete, false)
  assert.equal(commentParts({ ...cm, author: null }, null, NOW).author, 'Member')
})

test('groupShareText / inviteRowParts: the shared summary in the group currency, an invite on the list', () => {
  const text = groupShareText({
    group: { name: 'Lisbon', currency: 'EUR' }, members: MEMBERS,
    expenses: [{ amount_minor: 3000, currency: 'EUR' }], balances: new Map([['m1', 1000], ['m2', -1000]]),
  })
  assert.equal(text.split('\n')[0], 'Lisbon: €30.00 spent in total')
  assert.match(text, /• Sofia owes Alex €10\.00/)
  assert.deepEqual(inviteRowParts({ invite_id: 'i1', group_id: 'g1', group_name: 'Flat 3B', invited_by: 'Sam' }),
    { id: 'i1', groupId: 'g1', name: 'Flat 3B', text: 'Sam invited you' })
})
