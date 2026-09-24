import { useState } from 'react'
import { Stack, HStack, Text, Spacer, Button, Flex, IconButton } from '@chakra-ui/react'
import { HandCoins, FileDown, MessageSquare, Receipt } from 'lucide-react'
import { memberName, splitLabel, paidByLabel, isEveryoneEqualSplit } from './groupFormat.js'
import { formatMoney } from '../../shared/lib/currency.js'
import { shortDate, shortDateTime } from '../../shared/lib/dates.js'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'

const TABS = [['expenses', 'Expenses'], ['settlements', 'Settlements'], ['activity', 'Activity']]

// A group's history, tabbed: its expenses (tap to edit where allowed),
// settlements, and the activity log (with the PDF statement). Expense and
// settlement rows open their comment thread via `onThread({ type, id, label })`.
export default function GroupHistory({
  group, members, expenses, settlements, auditLog, counts, myMember, myUserId, isOwner,
  onEdit, onThread, reportBusy, onReport,
}) {
  const [tab, setTab] = useState('expenses')
  const cur = group.currency
  const nameOf = (mid) => memberName(members, mid)

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
        <Text color="text.muted" fontSize="sm">No shared expenses yet.</Text>
      ) : (
        <Stack spacing={0}>
          {expenses.map((e) => {
            const canEdit = e.created_by === myUserId || isOwner
            const label = e.description || 'Expense'
            return (
              <ItemRow key={e.id} icon={Receipt} title={label}
                meta={<RowMeta parts={[paidByLabel(members, e.paid_by, myMember?.id), shortDate(e.spent_at),
                  { text: splitLabel(e), phone: !isEveryoneEqualSplit(e, members) }]} />}
                amount={formatMoney(e.amount_minor, e.currency)}
                amountMeta={e.currency !== cur && e.group_amount_minor != null
                  ? `≈ ${formatMoney(e.group_amount_minor, cur)}` : undefined}
                onClick={canEdit ? () => onEdit(e) : undefined}
                trailing={<CommentButton count={counts.get(e.id)}
                  onClick={() => onThread({ type: 'expense', id: e.id, label })} />} />
            )
          })}
        </Stack>
      ))}

      {tab === 'settlements' && (settlements.length === 0 ? (
        <Text color="text.muted" fontSize="sm">No settlements yet.</Text>
      ) : (
        <Stack spacing={0}>
          {settlements.map((s) => {
            const label = `${nameOf(s.from_member)} → ${nameOf(s.to_member)}`
            return (
              <ItemRow key={s.id} icon={HandCoins} title={label} meta={shortDate(s.settled_at)}
                amount={formatMoney(s.amount_minor, s.currency)}
                trailing={<CommentButton count={counts.get(s.id)}
                  onClick={() => onThread({ type: 'settlement', id: s.id, label })} />} />
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
