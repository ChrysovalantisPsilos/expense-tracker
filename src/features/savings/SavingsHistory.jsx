import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, HStack, Stack, Text, useToast } from '@chakra-ui/react'
import { Pencil, PiggyBank, Repeat, Trash2 } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import MetaLine from '../../shared/ui/MetaLine.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import SegmentedControl from '../../shared/ui/SegmentedControl.jsx'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { ONE_LINE } from '../../shared/lib/shortLandscape.js'
import DeleteTransactionDialog from '../../shared/ui/DeleteTransactionDialog.jsx'
import { deleteTransaction } from '../../shared/lib/transactions.js'
import { HISTORY_MONTHS, historyFilters, historyWindow, savingsHistory } from './savingsMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// One entry (savingsRowParts): its date and where the money came from or
// went ("from income", "received", "from savings"), a repeat mark when a rule
// adds it, and the amount signed by what it did to the pot. No category tag:
// everything here is savings. The title keeps to one line; the meta wraps
// (Greek runs long).
function SavingsRow({ parts, open, remove }) {
  const t = useT('savings')
  const { row: r, out } = parts
  return (
    <ItemRow py={1.5} onClick={() => open(r)}
      media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
      title={<Box as="span" display="block" sx={ONE_LINE}>{parts.title}</Box>}
      meta={
        <MetaLine>
          <Text whiteSpace="nowrap">{parts.date}</Text>
          <Text>
            <Text as="span" color={out ? 'text.primary' : undefined} fontWeight={out ? 600 : undefined}>
              {parts.note}
            </Text>
            {parts.repeats && (
              <Box as="span" display="inline-flex" ml={1.5} verticalAlign="-1px" aria-label={t('history.repeats')} role="img">
                <Repeat size={11} aria-hidden />
              </Box>
            )}
          </Text>
        </MetaLine>
      }
      amount={parts.amount}
      amountTone={parts.tone}
      actionSlots={2} actions={[
        { label: t('common:actions.edit'), icon: Pencil, onClick: () => open(r) },
        { label: t('common:actions.delete'), icon: Trash2, danger: true, onClick: () => remove(r) },
      ]} />
  )
}

// "Savings history": only the entries that move the pot, month by month,
// newest first, each month headed by its net change (green when the pot
// grew, muted otherwise). All / In / Out narrows the rows; the latest
// HISTORY_MONTHS months show first, and "Show older" adds more.
export default function SavingsHistory({ moves, savingsIds, baseCurrency, reload }) {
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT('savings')
  const [filter, setFilter] = useState('all')
  const [months, setMonths] = useState(HISTORY_MONTHS)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const { groups, empty } = useMemo(
    () => savingsHistory(moves, savingsIds, baseCurrency, filter), [moves, savingsIds, baseCurrency, filter])
  const shown = historyWindow(groups.length, months)

  // The transaction page gets the row in router state, so it opens at once.
  const open = (r) => navigate(`/transactions/${r.id}`, { state: { row: r } })

  async function confirmRemove() {
    setBusy(true)
    try {
      await deleteTransaction(removing.id)
      toast({ title: t(removing.kind === 'income' ? 'history.deletedIncome' : 'history.deletedExpense'), status: 'success' })
      reload()
    } catch (e) {
      toast(saveErrorToast(e, t('history.deleteFailed')))
    } finally {
      setBusy(false); setRemoving(null)
    }
  }

  return (
    <Panel icon={PiggyBank} title={t('history.title')} subtitle={t('history.subtitle')}>
      <SegmentedControl options={historyFilters().map((f) => [f.value, f.label])} value={filter} onChange={setFilter}
        isFitted label={t('history.show')} />
      {empty ? (
        <Text color="text.muted" fontSize="sm" mt={4}>{empty}</Text>
      ) : (
        <Stack spacing={4} mt={4}>
          {groups.slice(0, shown.shown).map((g) => (
            <Box key={g.key} as="section" aria-label={g.heading}>
              <HStack justify="space-between" pb={1.5} mb={1} borderBottomWidth="1px" borderColor="border.default">
                <Text as="h3" fontFamily="heading" fontWeight="700" fontSize="sm">{g.heading}</Text>
                <Text fontSize="sm" fontWeight="700" whiteSpace="nowrap"
                  color={g.net.tone === 'positive' ? 'status.positive' : 'text.muted'}>
                  {g.net.text}
                </Text>
              </HStack>
              {g.rows.map((parts) => (
                <SavingsRow key={parts.id} parts={parts} open={open} remove={setRemoving} />
              ))}
            </Box>
          ))}
        </Stack>
      )}
      {shown.more && (
        <Button variant="outline" size="sm" w="full" mt={4} onClick={() => setMonths(shown.next)}>
          {t('history.older')}
        </Button>
      )}

      <DeleteTransactionDialog row={removing} onClose={() => setRemoving(null)}
        onConfirm={confirmRemove} busy={busy} />
    </Panel>
  )
}
