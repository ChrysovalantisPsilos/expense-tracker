// The native app's Groups screens as the web's functions work them out, for
// their parity fixture (as screenFigures.mjs is for the money screens):
//   npm run ios:fixture   →  ios/Budgeer/BudgeerTests/Fixtures/groups.json
// The inputs are the rows the app's data layer reads (the groups query,
// each group's members, avatars and balances, group_ledger, the activity
// log, the comment counts, the invites) and what the web's functions give
// for them, in English and in Greek: the groups list, a group's page seen
// by its owner and by a member, the expense form and the settle-up page.
// The Swift tests run the same inputs through GroupFigures.swift (every
// step a core call) and must get the same; test/iosScreens.test.js keeps
// the committed file equal to what the web gives today.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatMoney } from '../src/shared/lib/currency.js'
import {
  activityParts, avatarStackParts, balancesFrom, balancesParts, commentCountsFrom, expenseRowParts, groupCardParts,
  groupDeleteCheck, groupShareText, groupTotal, groupViewer, inviteRowParts, memberRowParts, membersWithAvatars,
  pluralise, settlementRowParts, stillInNames,
} from '../src/features/groups/groupFormat.js'
import {
  expenseFormStart, expenseSaveArgs, expenseSaveProblem, expenseSavedToast, includedIds, paidMinorOf, splitCardParts,
  splitPreview, splitTotal,
} from '../src/features/groups/groupExpenseForm.js'
import {
  settleFormStart, settleOtherLine, settleOthers, settleParties, settleProblem, settleSuggestionParts, settlementArgs,
} from '../src/features/groups/settleForm.js'
import { groupColour } from '../src/features/groups/groupCover.js'
import { setLanguage } from './index.js'

export const FIXTURES_DIR = 'ios/Budgeer/BudgeerTests/Fixtures'

// The groups tab: each group's card (its summary, when it loaded, joined as
// listGroupSummaries joins it) and the invites.
//   summaries  { [groupId]: { members, avatars, balances } } (rows as read)
export function groupsListFigures({ groups, summaries, invites, userId, lang = 'en' }) {
  setLanguage(lang)
  const cards = groups.map((g) => {
    const raw = summaries[g.id]
    const summary = raw
      ? { members: membersWithAvatars(raw.members, raw.avatars), balances: balancesFrom(raw.balances) }
      : undefined
    return groupCardParts(g, summary, userId)
  })
  return { cards, invites: invites.map(inviteRowParts) }
}

// A group's page (GroupDetail: the header, the balances, the history; the
// members page's rows, the share text, whether it can be deleted).
//   detail  { group, members, avatars, balances, ledger: { expenses, settlements } }
export function groupPageFigures({ detail, auditLog, counts, userId, now, lang = 'en' }) {
  setLanguage(lang)
  const date = new Date(now)
  const { group } = detail
  const cur = group.currency
  const members = membersWithAvatars(detail.members, detail.avatars)
  const balances = balancesFrom(detail.balances)
  const expenses = detail.ledger?.expenses ?? []
  const settlements = detail.ledger?.settlements ?? []
  const { myMember, isOwner } = groupViewer(group, members, userId)
  const countMap = commentCountsFrom(counts)
  const check = groupDeleteCheck(group, members, userId)
  const rowOptions = { members, myMemberId: myMember?.id, myUserId: userId, isOwner, currency: cur, counts: countMap, now: date }
  return {
    name: group.name,
    imageUrl: group.image_url ?? null,
    colour: groupColour(group.id),
    currency: cur,
    total: formatMoney(groupTotal(expenses, cur), cur),
    members: pluralise(members.length, 'member'),
    avatars: avatarStackParts(members, userId),
    myMemberId: myMember?.id ?? null,
    isOwner,
    balances: balancesParts({ balances, members, myMember, myUserId: userId, currency: cur }),
    expenses: expenses.map((e) => expenseRowParts(e, rowOptions)),
    settlements: settlements.map((s) => settlementRowParts(s, rowOptions)),
    activity: activityParts(auditLog, cur, date),
    memberRows: memberRowParts(members, userId, isOwner),
    shareText: groupShareText({ group, expenses, balances, members }),
    canDelete: check.canDelete,
    stillIn: stillInNames(check.others),
  }
}

// The expense form after the user's edits, from where it opened: the start,
// the split's preview and card, what stops a save (or null), what a save
// sends and the toast. `edits` replaces fields of the start; `rate` is the
// rate in use (1 for the group's currency).
export function expenseFormFigures({ group, members, myMemberId, expense, initial, today, edits, rate, quick, lang = 'en' }) {
  setLanguage(lang)
  const cur = group.currency
  const start = expenseFormStart({ expense, members, defaultPayer: myMemberId, groupCurrency: cur, initial, today })
  const form = { ...start, ...edits }
  const ids = includedIds(members, form.splitWith)
  const needsFx = form.paidCurrency !== cur
  const paidMinor = paidMinorOf(form.amount, form.paidCurrency)
  const totalMinor = splitTotal({ paidMinor, paidCurrency: form.paidCurrency, rate, groupCurrency: cur })
  const preview = splitPreview({ mode: form.mode, totalMinor, ids, values: form.values, currency: cur, needsFx, paidMinor, rate })
  return {
    start,
    totalMinor,
    preview: { byMember: preview.byMember, shareText: preview.shareText, summary: preview.summary, complete: preview.complete },
    card: splitCardParts({ mode: form.mode, included: ids.length, total: members.length, summary: preview.summary }),
    problem: expenseSaveProblem({ rate, fxLoading: false, ids, mode: form.mode, preview, totalMinor, currency: cur }),
    args: expenseSaveArgs({
      groupId: group.id, expenseId: expense?.id, description: form.description, paidMinor, paidCurrency: form.paidCurrency,
      needsFx, rate, paidBy: form.paidBy, spentAt: form.spentAt, ids, mode: form.mode, preview,
    }),
    toast: expenseSavedToast({
      isEdit: !!expense, quick, groupName: group.name, myShare: preview.byMember[myMemberId] ?? 0, currency: cur,
    }),
  }
}

// The settle-up page as it opens for the viewer: the form, the suggestions,
// the line about the other person, the names either side of the arrow,
// what stops it (or null) and what recording it sends.
export function settleFigures({ group, members, balances, myMemberId, today, lang = 'en' }) {
  setLanguage(lang)
  const cur = group.currency
  const map = balancesFrom(balances)
  const start = settleFormStart({ balances: map, members, myMemberId, currency: cur, today })
  return {
    others: settleOthers(members, myMemberId).map((m) => m.id),
    start,
    suggestions: settleSuggestionParts({ balances: map, members, myMemberId, currency: cur }),
    otherLine: settleOtherLine({ balances: map, members, otherId: start.otherId, currency: cur }),
    parties: settleParties({ direction: start.direction, members, otherId: start.otherId }),
    problem: settleProblem({ otherId: start.otherId, amount: start.amount }),
    args: settlementArgs({
      groupId: group.id, direction: start.direction, myMemberId, otherId: start.otherId, amount: start.amount,
      currency: cur, settledAt: start.settledAt,
    }),
  }
}

// ---- The fixture's inputs (fake data) ---------------------------------------
const ALEX = '0badbeef-0000-4000-8000-000000000001' // the signed-in user (AuthUser.sample in the Swift tests)
const SOFIA = 'aaaaaaaa-0000-4000-8000-000000000002'
const MARCO = 'aaaaaaaa-0000-4000-8000-000000000003'
const member = (id, user_id, display_name, role = 'member') => ({
  id, group_id: 'g-lisbon', user_id, display_name, role, created_at: `2026-08-0${id.slice(-1)}T10:00:00Z`,
})
const MEMBERS = [
  member('m1', ALEX, 'Alex Morgan', 'owner'),
  member('m2', SOFIA, 'Sofia'),
  member('m3', MARCO, 'Marco Rossi'),
  member('m4', null, 'Anna'),
]
const AVATARS = [{ user_id: SOFIA, avatar_url: 'https://example.com/sofia.png' }]
const BALANCES = [
  { member_id: 'm1', net_minor: 16275 }, { member_id: 'm2', net_minor: -8925 },
  { member_id: 'm3', net_minor: -7065 }, { member_id: 'm4', net_minor: -285 },
]
const LISBON = {
  id: 'g-lisbon', name: 'Lisbon trip', currency: 'EUR', owner_id: ALEX, image_url: null,
  created_at: '2026-08-01T10:00:00Z', group_members: [{ count: 4 }],
}
const FLAT = {
  id: 'g-flat', name: 'Flat 3B', currency: 'GBP', owner_id: SOFIA, image_url: 'https://example.com/flat.png',
  created_at: '2026-07-01T10:00:00Z', group_members: [{ count: 2 }],
}
const split = (...pairs) => pairs.map(([member_id, share_minor]) => ({ member_id, share_minor }))
const EXPENSES = [
  {
    id: 'e1', group_id: 'g-lisbon', description: 'Dinner at the harbour', amount_minor: 24000, currency: 'EUR',
    exchange_rate: null, group_amount_minor: 24000, paid_by: 'm1', spent_at: '2026-09-14', created_by: ALEX,
    split_type: 'equal', expense_splits: split(['m1', 6000], ['m2', 6000], ['m3', 6000], ['m4', 6000]),
  },
  {
    id: 'e2', group_id: 'g-lisbon', description: 'Museum tickets', amount_minor: 4250, currency: 'GBP',
    exchange_rate: 1.1699, group_amount_minor: 4972, paid_by: 'm2', spent_at: '2026-09-12', created_by: SOFIA,
    split_type: 'exact', expense_splits: split(['m1', 2486], ['m2', 2486]),
  },
  {
    id: 'e3', group_id: 'g-lisbon', description: null, amount_minor: 1000, currency: 'EUR', exchange_rate: null,
    group_amount_minor: 1000, paid_by: 'm3', spent_at: '2025-12-30', created_by: MARCO, split_type: 'percent',
    expense_splits: split(['m1', 3334], ['m2', 3333], ['m3', 3333]).map((s) => ({ ...s, share_minor: s.share_minor / 10 })),
  },
]
const SETTLEMENTS = [
  {
    id: 's1', group_id: 'g-lisbon', from_member: 'm3', to_member: 'm1', amount_minor: 2000, currency: 'EUR',
    note: null, settled_at: '2026-09-15', created_by: MARCO,
  },
]
const AUDIT = [
  { id: 'a1', summary: 'Sofia added “Museum tickets”', created_at: '2026-09-12T18:30:00Z', amount_minor: 4250, currency: 'GBP' },
  { id: 'a2', summary: 'Anna joined the group', created_at: '2026-08-04T09:05:00Z', amount_minor: null, currency: null },
]
const COUNTS = [{ target_id: 'e2', n: 3 }, { target_id: 's1', n: 1 }]

export const GROUPS_INPUT = {
  now: '2026-09-20T12:00:00.000Z',
  today: '2026-09-20',
  userId: ALEX,
  sofiaId: SOFIA,
  groups: [LISBON, FLAT],
  summaries: {
    'g-lisbon': { members: MEMBERS, avatars: AVATARS, balances: BALANCES },
    'g-flat': {
      members: [{ ...member('f1', SOFIA, 'Sofia', 'owner'), group_id: 'g-flat' }, { ...member('f2', ALEX, 'Alex Morgan'), group_id: 'g-flat' }],
      avatars: AVATARS,
      balances: [{ member_id: 'f1', net_minor: 1250 }, { member_id: 'f2', net_minor: -1250 }],
    },
  },
  invites: [{ invite_id: 'i1', group_id: 'g-ski', group_name: 'Ski week', invited_by: 'Marco Rossi' }],
  detail: {
    group: LISBON, members: MEMBERS, avatars: AVATARS, balances: BALANCES,
    ledger: { expenses: EXPENSES, settlements: SETTLEMENTS },
  },
  auditLog: AUDIT,
  counts: COUNTS,
  // The expense form: each scenario's start and the user's edits.
  forms: [
    { name: 'new', edits: { description: 'Taxi', amount: '84.60' }, rate: 1, quick: false },
    {
      name: 'quick', quick: true, rate: 0.9,
      initial: { amount: '12.5', currency: 'USD', currencyPicked: true, description: 'Snacks', spentAt: '2026-09-19' },
      edits: { splitWith: ['m1', 'm2', 'm3'] },
    },
    {
      name: 'exactShort', rate: 1, quick: false,
      edits: { description: 'Groceries', amount: '30', mode: 'exact', values: { m1: '10', m2: '12.50' }, splitWith: ['m1', 'm2'] },
    },
    { name: 'editPercent', expenseId: 'e3', rate: 1, quick: false, edits: {} },
  ],
}

export function groupsFixture() {
  const input = GROUPS_INPUT
  const expected = {}
  for (const lang of ['en', 'el']) {
    const forms = {}
    for (const f of input.forms) {
      const expense = f.expenseId ? EXPENSES.find((e) => e.id === f.expenseId) : null
      forms[f.name] = expenseFormFigures({
        group: LISBON, members: MEMBERS, myMemberId: 'm1', expense, initial: f.initial ?? null,
        today: input.today, edits: f.edits, rate: f.rate, quick: f.quick, lang,
      })
    }
    expected[lang] = {
      list: groupsListFigures({ ...input, lang }),
      owner: groupPageFigures({ ...input, lang }),
      member: groupPageFigures({ ...input, userId: SOFIA, lang }),
      forms,
      settleOwed: settleFigures({ group: LISBON, members: MEMBERS, balances: BALANCES, myMemberId: 'm1', today: input.today, lang }),
      settlePay: settleFigures({ group: LISBON, members: MEMBERS, balances: BALANCES, myMemberId: 'm2', today: input.today, lang }),
    }
  }
  setLanguage('en')
  return { input, expected }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  await writeFile(resolve(root, FIXTURES_DIR, 'groups.json'), JSON.stringify(groupsFixture(), null, 2) + '\n')
  console.log(`groups fixture: ${FIXTURES_DIR}/groups.json`)
}
