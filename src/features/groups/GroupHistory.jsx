import { useSearchParams } from 'react-router-dom'
import { Stack, HStack, Text, Spacer, Button, Flex, IconButton } from '@chakra-ui/react'
import { HandCoins, FileDown, MessageSquare, Plus, Receipt, UserPlus } from 'lucide-react'
import { splitLabel, paidByLabel, isEveryoneEqualSplit, expenseLabel, settlementLabel } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate, shortDateTime } from '../../shared/lib/dates.js'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'

const TABS = [['expenses', 'Expenses'], ['settlements', 'Settlements'], ['activity', 'Activity']]

// A group's history, tabbed: its expenses (tap to edit where allowed, via
// `onEdit(expense)`), settlements, and the activity log (with the PDF
// statement). Expense and settlement rows open their comments via
// `onThread(itemId)`. The open tab is kept in the address (?tab=), so
// coming back from a comments page or an expense lands on it again. With no
// expenses yet, the Expenses tab offers `onAdd` (and `onMembers` while you're
// the only one in the group).
export default function GroupHistory({
  group, members, expenses, settlements, auditLog, counts, myMember, myUserId, isOwner,
  onEdit, onThread, onAdd, onMembers, reportBusy, onReport,
}) {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'expenses'
  const setTab = (t) => setParams(t === 'expenses' ? {} : { tab: t }, { replace: true })
  const cur = group.currency

  return (
    <Panel>
      <HStack mb={3}>
        <SegmentedControl label="History" value={tab} onChange={setTab} options={TABS} />
        <Spacer />
        {tab === 'activity' && (
          <Button size="xs" variant="ghost" leftIcon={<FileDown size={14} />}
            isLoading={reportBusy} spinner={<RingSpinner />} onClick={onReport}>PDF</Button>
        )}
      </HStack>

      {tab === 'expenses' && (expenses.length === 0 ? (
        <EmptyState variant="split" title="No shared expenses yet"
          text="Add what someone paid for the group, and Budgeer works out who owes whom."
          actions={<>
            <Button leftIcon={<Plus size={18} />} onClick={onAdd}>Add the first expense</Button>
            {members.length < 2 && (
              <Button variant="outline" colorScheme="gray" leftIcon={<UserPlus size={18} />} onClick={onMembers}>
                Invite people
              </Button>
            )}
          </>} />
      ) : (
        <Stack spacing={0}>
          {expenses.map((e) => {
            const canEdit = e.created_by === myUserId || isOwner
            return (
              <ItemRow key={e.id} icon={Receipt} title={expenseLabel(e)}
                meta={<RowMeta parts={[paidByLabel(members, e.paid_by, myMember?.id), shortDate(e.spent_at),
                  { text: splitLabel(e), phone: !isEveryoneEqualSplit(e, members) }]} />}
                amount={formatMoney(e.amount_minor, e.currency)}
                amountMeta={e.currency !== cur && e.group_amount_minor != null
                  ? `≈ ${formatMoney(e.group_amount_minor, cur)}` : undefined}
                onClick={canEdit ? () => onEdit(e) : undefined}
                trailing={<CommentButton count={counts.get(e.id)}
                  onClick={() => onThread(e.id)} />} />
            )
          })}
        </Stack>
      ))}

      {tab === 'settlements' && (settlements.length === 0 ? (
        <Text color="text.muted" fontSize="sm">No settlements yet.</Text>
      ) : (
        <Stack spacing={0}>
          {settlements.map((s) => {
            return (
              <ItemRow key={s.id} icon={HandCoins} title={settlementLabel(s, members, myMember?.id)}
                meta={shortDate(s.settled_at)}
                amount={formatMoney(s.amount_minor, s.currency)}
                trailing={<CommentButton count={counts.get(s.id)}
                  onClick={() => onThread(s.id)} />} />
            )
          })}
        </Stack>
      ))}

      {tab === 'activity' && (auditLog.length === 0 ? (
        <Text fontSize="sm" color="text.muted">No activity yet.</Text>
      ) : (
        <Stack spacing={0}>
          {auditLog.slice(0, 25).map((a) => (
            <HStack key={a.id} py={2} align="start" spacing={3}>
              <Stack spacing={0} flex="1" minW={0}>
                <Text fontSize="sm" overflowWrap="anywhere">{a.summary}</Text>
                <Text fontSize="xs" color="text.muted">{shortDateTime(a.created_at)}</Text>
              </Stack>
              {a.amount_minor != null && (
                <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap">
                  {formatMoney(a.amount_minor, a.currency || cur)}
                </Text>
              )}
            </HStack>
          ))}
        </Stack>
      ))}
    </Panel>
  )
}

// A row's muted meta line that wraps between its parts on narrow screens
// ("Paid by You · 8 Sep · split 4 ways"). A part is a string, or
// { text, phone: false } to hide it below `sm`. Each separator stays at the
// end of the part before it (so a wrapped line never starts with one) and
// shows only where the part after it does.
function RowMeta({ parts }) {
  const list = parts.map((p) => (typeof p === 'string' ? { text: p, phone: true } : p))
  const shown = (p) => (p.phone ? undefined : { base: 'none', sm: 'inline' })
  return (
    <Flex wrap="wrap" columnGap={1} fontSize="xs" color="text.muted">
      {list.map((p, i) => (
        <Text key={i} display={shown(p)} overflowWrap="anywhere" maxW="100%">
          {p.text}
          {i < list.length - 1 && <Text as="span" display={shown(list[i + 1])}> ·</Text>}
        </Text>
      ))}
    </Flex>
  )
}

// A row's trailing comment icon with its count, in a fixed-width slot so the
// amounts of a list line up.
function CommentButton({ count, onClick }) {
  return (
    <HStack spacing={0.5} w="40px" flexShrink={0}>
      <IconButton aria-label="Comments" size="xs" variant="ghost" color="text.muted"
        icon={<MessageSquare size={15} />} onClick={onClick} />
      {count > 0 && <Text fontSize="xs" color="text.muted">{count}</Text>}
    </HStack>
  )
}
