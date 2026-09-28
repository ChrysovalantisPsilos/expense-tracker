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
import { formatMoney } from '../../shared/lib/currency.js'
import { monthHeading, shortDate } from '../../shared/lib/dates.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { HISTORY_MONTHS, HISTORY_MORE } from '../savings/savingsMath.js'
import { daysFor, withDays } from './voucherMath.js'
import { saveMealVouchers, useMealVouchers, useVoucherCard } from './vouchers.js'
import { NextTopUp, monthOfKey } from './VoucherParts.jsx'

export default function Vouchers() {
  const t = useT('vouchers')
  const { settings, loading, error, reload } = useMealVouchers()
  const header = <PageHeader title={t('title')} action={
    <IconButton as={RouterLink} to="/settings/vouchers" size="sm" variant="ghost" aria-label={t('settingsLink')}
      icon={<Settings2 size={18} />} />
  } />
  let body
  if (error) body = <Panel><QueryError error={error} onRetry={reload} what={t('what')} /></Panel>
  else if (loading && !settings) body = <Panel><RingLoader compact /></Panel>
  else if (!settings) {
    body = (
      <Panel>
        <EmptyState title={t('title')} text={t('setup.lead')}
          actions={<Button as={RouterLink} to="/settings/vouchers">{t('setup.start')}</Button>} />
      </Panel>
    )
  } else body = <Card settings={settings} />
  return <Stack spacing={5}>{header}{body}</Stack>
}

function money(minor, currency) {
  return `${minor < 0 ? '−' : ''}${formatMoney(Math.abs(minor), currency)}`
}

function Card({ settings }) {
  const t = useT('vouchers')
  const { card, error, reload } = useVoucherCard(settings)
  const { summary, next } = card
  const cur = settings.currency
  return (
    <>
      <Panel>
        <Figure label={t('balance')} size="hero" value={money(summary.balance, cur)}
          tone={summary.balance < 0 ? 'negative' : 'default'} />
        <BalanceGrid mt={3}>
          <BalanceTile label={t('month.topUps')} value={`+${formatMoney(summary.monthTopUps, cur)}`}
            tone={summary.monthTopUps ? 'positive' : 'muted'} />
          <BalanceTile label={t('month.spent')} value={money(-summary.monthSpent, cur)}
            tone={summary.monthSpent ? 'default' : 'muted'} />
        </BalanceGrid>
      </Panel>
      <NextCard settings={settings} next={next} />
      {error ? <Panel><QueryError error={error} onRetry={reload} what={t('what')} /></Panel>
        : <History settings={settings} groups={card.history} />}
    </>
  )
}

// The next top-up; "Fix days" opens the days of the month it pays for, in place.
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
  const { days: start, auto } = daysFor(settings, month)
  const [days, setDays] = useState(start)
  const [busy, setBusy] = useState(false)
  const cur = settings.currency

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
      <Text fontSize="sm" fontWeight="600">{t('fix.label', { month: monthOfKey(month) })}</Text>
      <HStack mt={2} spacing={3} flexWrap="wrap">
        <IconButton aria-label={t('fix.fewer')} icon={<Minus size={16} />} variant="outline"
          isDisabled={days <= 0} onClick={() => setDays(days - 1)} />
        <Text fontFamily="heading" fontWeight="700" fontSize="xl" minW="32px" textAlign="center" aria-live="polite">
          {days}
        </Text>
        <IconButton aria-label={t('fix.more')} icon={<Plus size={16} />} variant="outline"
          isDisabled={days >= 31} onClick={() => setDays(days + 1)} />
        <Text fontSize="sm" color="text.muted">
          <Trans t={t} k="fix.total" values={{
            perDay: formatMoney(settings.per_day_minor, cur), amount: formatMoney(days * settings.per_day_minor, cur),
          }} components={{ b: <Text as="b" color="text.primary" /> }} />
        </Text>
      </HStack>
      <Text fontSize="xs" color="text.muted" mt={2}>{t('fix.hint', { count: auto })}</Text>
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
  const cur = settings.currency
  const shown = groups.slice(0, months)
  return (
    <Panel title={t('history.title')} divider>
      <Stack spacing={4}>
        {shown.map((g) => (
          <Box key={g.month} as="section" aria-label={monthHeading(g.month)}>
            <HStack justify="space-between" mb={1}>
              <Text as="h3" fontFamily="heading" fontWeight="700" fontSize="sm">{monthHeading(g.month)}</Text>
              <Text fontSize="sm" fontWeight="700" color={g.net > 0 ? 'status.positive' : 'text.muted'}>
                {g.net > 0 ? `+${formatMoney(g.net, cur)}` : money(g.net, cur)}
              </Text>
            </HStack>
            <Stack spacing={0}>
              {g.items.map((item) => <HistoryRow key={`${item.type}-${item.row?.id ?? item.on}`} item={item}
                currency={cur} open={(r) => navigate(`/transactions/${r.id}`, { state: { row: r } })} />)}
            </Stack>
          </Box>
        ))}
      </Stack>
      {groups.length > months && (
        <Button variant="outline" w="full" mt={3} size="sm" onClick={() => setMonths(months + HISTORY_MORE)}>
          {t('savings:history.older')}
        </Button>
      )}
    </Panel>
  )
}

function HistoryRow({ item, currency, open }) {
  const t = useT('vouchers')
  if (item.type === 'spend') {
    const r = item.row
    return (
      <ItemRow py={1.5} onClick={() => open(r)}
        media={<CategoryBadge category={r.categories} kind={r.kind} size={32} />}
        title={r.description || categoryDisplayName(r.categories) || t('history.noCategory')}
        meta={`${shortDate(r.spent_at)} · ${categoryDisplayName(r.categories) || t('history.noCategory')}`}
        amount={money(item.minor, currency)} />
    )
  }
  if (item.type === 'topup') {
    return (
      <ItemRow py={1.5} icon={Ticket} title={t('history.topUp')}
        meta={t('history.topUpMeta', { date: shortDate(item.on), month: monthOfKey(item.month), count: item.days })}
        amount={`+${formatMoney(item.minor, currency)}`} amountTone="positive" />
    )
  }
  return (
    <ItemRow py={1.5} icon={Wallet} title={t('history.start')}
      meta={t('history.startMeta', { date: shortDate(item.on) })}
      amount={formatMoney(item.minor, currency)} amountTone="muted" />
  )
}
