import { useSearchParams } from 'react-router-dom'
import { Stack, HStack, Text, Spacer, Button, Flex, IconButton } from '@chakra-ui/react'
import { HandCoins, FileDown, MessageSquare, Plus, Receipt, UserPlus } from 'lucide-react'
import { activityParts, expenseRowParts, settlementRowParts } from './groupFormat.js'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The tabs' ids; their names are groups:history.tabs.<id>.
const TABS = ['expenses', 'settlements', 'activity']

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
  const t = useT('groups')
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'expenses'
  const setTab = (t) => setParams(t === 'expenses' ? {} : { tab: t }, { replace: true })
  const cur = group.currency

  return (
    <Panel>
      <HStack mb={3}>
        <SegmentedControl label={t('history.label')} value={tab} onChange={setTab}
          options={TABS.map((id) => [id, t(`history.tabs.${id}`)])} />
        <Spacer />
        {tab === 'activity' && (
          <Button size="xs" variant="ghost" leftIcon={<FileDown size={14} />}
            isLoading={reportBusy} spinner={<RingSpinner />} onClick={onReport}>{t('history.pdf')}</Button>
        )}
      </HStack>

      {tab === 'expenses' && (expenses.length === 0 ? (
        <EmptyState variant="split" title={t('history.empty.title')} text={t('history.empty.text')}
          actions={<>
            <Button leftIcon={<Plus size={18} />} onClick={onAdd}>{t('history.empty.add')}</Button>
            {members.length < 2 && (
              <Button variant="outline" colorScheme="gray" leftIcon={<UserPlus size={18} />} onClick={onMembers}>
                {t('history.empty.invite')}
              </Button>
            )}
          </>} />
      ) : (
        <Stack spacing={0}>
          {expenses.map((e) => {
            const row = expenseRowParts(e, { members, myMemberId: myMember?.id, myUserId, isOwner, currency: cur, counts })
            return (
              <ItemRow key={row.id} icon={Receipt} title={row.title} meta={<RowMeta parts={row.meta} />}
                amount={row.amount} amountMeta={row.amountMeta ?? undefined}
                onClick={row.canEdit ? () => onEdit(e) : undefined}
                trailing={<CommentButton count={row.comments} onClick={() => onThread(row.id)} />} />
            )
          })}
        </Stack>
      ))}

      {tab === 'settlements' && (settlements.length === 0 ? (
        <Text color="text.muted" fontSize="sm">{t('history.noSettlements')}</Text>
      ) : (
        <Stack spacing={0}>
          {settlements.map((s) => {
            const row = settlementRowParts(s, { members, myMemberId: myMember?.id, counts })
            return (
              <ItemRow key={row.id} icon={HandCoins} title={row.title} meta={row.meta} amount={row.amount}
                trailing={<CommentButton count={row.comments} onClick={() => onThread(row.id)} />} />
            )
          })}
        </Stack>
      ))}

      {tab === 'activity' && (auditLog.length === 0 ? (
        <Text fontSize="sm" color="text.muted">{t('history.noActivity')}</Text>
      ) : (
        <Stack spacing={0}>
          {activityParts(auditLog, cur).map((a) => (
            <HStack key={a.id} py={2} align="start" spacing={3}>
              <Stack spacing={0} flex="1" minW={0}>
                <Text fontSize="sm" overflowWrap="anywhere">{a.text}</Text>
                <Text fontSize="xs" color="text.muted">{a.when}</Text>
              </Stack>
              {a.amount != null && (
                <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap">{a.amount}</Text>
              )}
            </HStack>
          ))}
        </Stack>
      ))}
    </Panel>
  )
}

// A row's muted meta line that wraps between its parts on narrow screens
// ("Paid by You · 8 Sep · split 4 ways"). A part is { text, phone }, and
// `phone: false` hides it below `sm`. Each separator stays at the
// end of the part before it (so a wrapped line never starts with one) and
// shows only where the part after it does.
function RowMeta({ parts: list }) {
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
  const t = useT('groups')
  return (
    <HStack spacing={0.5} w="40px" flexShrink={0}>
      <IconButton aria-label={t('history.comments')} size="xs" variant="ghost" color="text.muted"
        icon={<MessageSquare size={15} />} onClick={onClick} />
      {count > 0 && <Text fontSize="xs" color="text.muted">{count}</Text>}
    </HStack>
  )
}
