// The Meal vouchers page (/vouchers): what's on the card with this month's
// top-ups and spending, the next top-up (its days fixed in place: leave, sick
// days), and the card's history since the setup, month by month.
import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box, Button, Flex, HStack, IconButton, Stack, Text, useToast,
} from '@chakra-ui/react'
import { Minus, Pencil, Plus, Settings2, Ticket, Wallet } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { HISTORY_MONTHS, historyWindow } from '../savings/savingsMath.js'
import { daysFor, withDays } from './voucherMath.js'
import { saveMealVouchers, useMealVouchers, useVoucherCard } from './vouchers.js'
import { NextTopUp } from './VoucherParts.jsx'
import { daysFixParts, voucherHistoryParts, voucherPageParts } from './voucherText.js'
import MoreBackButton from '../../shared/ui/MoreBackButton.jsx'

export default function Vouchers() {
  const t = useT('vouchers')
  const { settings, loading, error, reload } = useMealVouchers()
  const header = <PageHeader leading={<MoreBackButton />} title={t('title')} action={
    <IconButton as={RouterLink} to="/settings/vouchers" state={{ from: 'vouchers' }} size="sm" variant="ghost" aria-label={t('settingsLink')}
      icon={<Settings2 size={18} />} />
  } />
  let body
  if (error) body = <Panel><QueryError error={error} onRetry={reload} what={t('what')} /></Panel>
  else if (loading && !settings) body = <Panel><RingLoader compact /></Panel>
  else if (!settings) {
    body = (
      <Panel>
        <EmptyState title={t('title')} text={t('setup.lead')}
          actions={<Button as={RouterLink} to="/settings/vouchers" state={{ from: 'vouchers' }}>{t('setup.start')}</Button>} />
      </Panel>
    )
  } else body = <Card settings={settings} />
  return <Stack spacing={5}>{header}{body}</Stack>
}

function Card({ settings }) {
  const t = useT('vouchers')
  const { card, error, reload } = useVoucherCard(settings)
  const { summary, next } = card
  const parts = voucherPageParts(settings, summary)
  return (
    <>
      <Panel>
        <Figure label={t('balance')} size="hero" value={parts.balance} tone={parts.tone} />
        <BalanceGrid mt={3}>
          <BalanceTile label={t('month.topUps')} value={parts.topUps.text} tone={parts.topUps.tone} />
          <BalanceTile label={t('month.spent')} value={parts.spent.text} tone={parts.spent.tone} />
        </BalanceGrid>
      </Panel>
      <NextCard settings={settings} next={next} />
      {error ? <Panel><QueryError error={error} onRetry={reload} what={t('what')} /></Panel>
        : <History settings={settings} groups={card.history} />}
    </>
  )
}

// The next top-up; "Edit days" opens the days of the month it pays for, in place.
function NextCard({ settings, next }) {
  const t = useT('vouchers')
  const [open, setOpen] = useState(false)
  return (
    <Panel icon={Ticket} title={t('next.title')}>
      <Flex justify="space-between" align="center" gap={3} flexWrap="wrap">
        <NextTopUp settings={settings} next={next} size="lg" />
        {!open && (
          <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} flexShrink={0}
            aria-expanded={false} onClick={() => setOpen(true)}>
            {t('fix.button')}
          </Button>
        )}
      </Flex>
      {open && <DaysFix settings={settings} month={next.month} onClose={() => setOpen(false)} />}
    </Panel>
  )
}

function DaysFix({ settings, month, onClose }) {
  const t = useT('vouchers')
  const toast = useToast()
  const { user } = useAuth()
  const [days, setDays] = useState(() => daysFor(settings, month).days)
  const [busy, setBusy] = useState(false)
  const parts = daysFixParts(settings, month, days)

  async function save() {
    setBusy(true)
    try {
      await saveMealVouchers(user.id, withDays(settings, month, days))
      onClose()
    } catch (err) {
      toast(saveErrorToast(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box mt={3} bg="bg.subtle" borderRadius="lg" p={3}>
      <Text fontSize="sm" fontWeight="600">{parts.label}</Text>
      <HStack mt={2} spacing={3} flexWrap="wrap">
        <IconButton aria-label={t('fix.fewer')} icon={<Minus size={16} />} variant="outline"
          isDisabled={!parts.fewer} onClick={() => setDays(days - 1)} />
        <Text fontFamily="heading" fontWeight="700" fontSize="xl" minW="32px" textAlign="center" aria-live="polite">
          {days}
        </Text>
        <IconButton aria-label={t('fix.more')} icon={<Plus size={16} />} variant="outline"
          isDisabled={!parts.more} onClick={() => setDays(days + 1)} />
        <Text fontSize="sm" color="text.muted">
          <Trans t={t} k="fix.total" values={parts.total} components={{ b: <Text as="b" color="text.primary" /> }} />
        </Text>
      </HStack>
      <Text fontSize="xs" color="text.muted" mt={2}>{parts.hint}</Text>
      <HStack mt={3} spacing={2}>
        <Button size="sm" onClick={save} isLoading={busy}>{t('fix.save')}</Button>
        <Button size="sm" variant="ghost" onClick={onClose} isDisabled={busy}>{t('fix.cancel')}</Button>
      </HStack>
    </Box>
  )
}

// The card's history since the setup: each month headed by its net change,
// newest first; the latest HISTORY_MONTHS months show, "Show older" adds more.
function History({ settings, groups }) {
  const t = useT('vouchers')
  const navigate = useNavigate()
  const [months, setMonths] = useState(HISTORY_MONTHS)
  const page = historyWindow(groups.length, months)
  const shown = voucherHistoryParts(settings, groups.slice(0, page.shown))
  return (
    <Panel title={t('history.title')} divider>
      <Stack spacing={4}>
        {shown.map((g) => (
          <Box key={g.month} as="section" aria-label={g.heading}>
            <HStack justify="space-between" mb={1}>
              <Text as="h3" fontFamily="heading" fontWeight="700" fontSize="sm">{g.heading}</Text>
              <Text fontSize="sm" fontWeight="700" color={g.net.tone === 'positive' ? 'status.positive' : 'text.muted'}>
                {g.net.text}
              </Text>
            </HStack>
            <Stack spacing={0}>
              {g.items.map((item) => <HistoryRow key={item.key} item={item}
                open={(r) => navigate(`/transactions/${r.id}`, { state: { row: r } })} />)}
            </Stack>
          </Box>
        ))}
      </Stack>
      {page.more && (
        <Button variant="outline" w="full" mt={3} size="sm" onClick={() => setMonths(page.next)}>
          {t('savings:history.older')}
        </Button>
      )}
    </Panel>
  )
}

// A history line (voucherHistoryParts): an expense opens its entry.
function HistoryRow({ item, open }) {
  if (item.type === 'spend') {
    const r = item.row
    return (
      <ItemRow py={1.5} onClick={() => open(r)}
        media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
        title={item.title} meta={item.meta} amount={item.amount} />
    )
  }
  return (
    <ItemRow py={1.5} icon={item.type === 'topup' ? Ticket : Wallet} title={item.title} meta={item.meta}
      amount={item.amount} amountTone={item.tone} />
  )
}
