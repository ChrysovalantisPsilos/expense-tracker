// The Extras card: holiday pay, 13th month and bonuses, newest year first,
// each correctable in place (Holiday pay / 13th month / Bonus / Not an
// extra, then Save or Cancel). A guessed one says so. Payments the user
// counted as pay stay listed as "Not an extra", so they can change their mind.
// Without a Bonus category the card asks which income category holds them.
import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, FormControl, FormLabel, HStack, Select, Stack, Text, Wrap, WrapItem, useToast } from '@chakra-ui/react'
import { Check, Gift, Pencil, Sparkles, Sun, Wallet } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { shortDate } from '../../shared/lib/dates.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'
import { landscapeOnly } from '../../shared/lib/shortLandscape.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { FIX_KINDS, yearOf } from './salaryMath.js'
import { money } from './SalaryParts.jsx'

const ICON = { holiday: Sun, thirteenth: Gift, bonus: Sparkles, regular: Wallet }
// Sideways the rows are narrow: "Fix" keeps only its pencil.
const ICON_ONLY_SIDEWAYS = landscapeOnly({ '.fix-text': { display: 'none' }, '.chakra-button__icon': { marginInlineEnd: 0 } })
// Years shown at first, and how many more each "Show older" adds.
const YEARS_SHOWN = 2

export default function ExtrasCard({ report, currency, bonusId, income, onFix, onBonusCategory }) {
  const t = useT('salary')
  const [openId, setOpenId] = useState(null)
  const [shown, setShown] = useState(YEARS_SHOWN)
  const byYear = useMemo(() => {
    const items = [...report.extras, ...report.regularFixed.map((r) => ({ ...r, kind: 'regular', fixed: true }))]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    const m = new Map()
    for (const e of items) {
      const y = yearOf(e.key)
      if (!m.has(y)) m.set(y, [])
      m.get(y).push(e)
    }
    return [...m.entries()]
  }, [report])
  return (
    <Panel title={t('extras.title')} subtitle={t('extras.subtitle')}>
      <Stack spacing={4}>
        {!bonusId && <BonusPicker income={income} onPick={onBonusCategory} />}
        {byYear.length === 0 && <Text fontSize="sm" color="text.muted">{t('extras.none')}</Text>}
        {byYear.slice(0, shown).map(([y, list]) => (
          <Box key={y}>
            <HStack justify="space-between" pb={1.5} mb={1} borderBottomWidth="1px" borderColor="border.default">
              <Text as="h3" fontFamily="heading" fontWeight="700" fontSize="sm">{y}</Text>
              <Text fontSize="sm" fontWeight="700">
                {money(list.filter((e) => e.kind !== 'regular').reduce((s, e) => s + e.minor, 0), currency)}
              </Text>
            </HStack>
            {list.map((e) => (
              <ExtraRow key={`${e.id}:${e.kind}`} extra={e} currency={currency} open={openId === e.id}
                onOpen={() => setOpenId(e.id)} onClose={() => setOpenId(null)}
                onSave={async (kind) => { await onFix(e.id, kind); setOpenId(null) }} />
            ))}
          </Box>
        ))}
        {byYear.length > shown && (
          <Button variant="outline" size="sm" w="full" onClick={() => setShown((n) => n + YEARS_SHOWN)}>{t('extras.older')}</Button>
        )}
      </Stack>
    </Panel>
  )
}

function ExtraRow({ extra, currency, open, onOpen, onClose, onSave }) {
  const t = useT('salary')
  const toast = useToast()
  const [pick, setPick] = useState(extra.kind)
  const [busy, setBusy] = useState(false)
  const regular = extra.kind === 'regular'
  const meta = (
    <HStack spacing={1.5} fontSize="xs" color="text.muted" minW={0} flexWrap="wrap" rowGap={0}>
      <Text>{[shortDate(extra.date), extra.inPay ? t('extras.inPay') : extra.description].filter(Boolean).join(' · ')}</Text>
      {extra.guess && (
        <Text as="span" px={1.5} borderRadius="md" bg="status.warningSubtle" color="status.warning" fontWeight="700">
          {t('extras.guess')}
        </Text>
      )}
      {extra.fixed && <Text as="span" color="status.positive" fontWeight="600">{t('extras.fixed')}</Text>}
    </HStack>
  )
  async function save() {
    setBusy(true)
    try { await onSave(pick) } catch (e) { toast(saveErrorToast(e)) } finally { setBusy(false) }
  }
  return (
    <Box borderRadius="lg" bg={open ? 'bg.subtle' : undefined} px={open ? 2 : 0} mx={open ? -2 : 0} pb={open ? 3 : 0}>
      <ItemRow icon={ICON[extra.kind]} title={t(`extras.${extra.kind}`)} meta={meta} py={1.5}
        amount={money(extra.minor, currency)} amountTone={regular ? 'muted' : 'default'}
        trailing={!open && (
          <Button size="sm" variant="ghost" leftIcon={<Pencil size={13} />} onClick={() => { setPick(extra.kind); onOpen() }}
            aria-label={t('extras.fixLabel', { kind: t(`extras.${extra.kind}`), date: shortDate(extra.date) })} ml={1} px={2}
            sx={ICON_ONLY_SIDEWAYS}>
            <Box as="span" className="fix-text">{t('extras.fix')}</Box>
          </Button>
        )} />
      {open && (
        <Box pl={{ base: 0, sm: '44px' }}>
          <Text id={`what-${extra.id}`} fontSize="xs" color="text.muted" mb={2}>{t('extras.what')}</Text>
          <Wrap spacing={2} role="group" aria-labelledby={`what-${extra.id}`}>
            {FIX_KINDS.map((k) => {
              const on = pick === k
              const I = ICON[k]
              return (
                <WrapItem key={k}>
                  <Button size="sm" borderRadius="full" variant={on ? 'solid' : 'outline'} colorScheme={on ? 'brand' : 'gray'}
                    leftIcon={on ? <Check size={14} /> : <I size={14} />} aria-pressed={on} onClick={() => setPick(k)}>
                    {t(`extras.${k}`)}
                  </Button>
                </WrapItem>
              )
            })}
          </Wrap>
          <HStack mt={3} spacing={2}>
            <Button size="sm" onClick={save} isLoading={busy}>{t('common:actions.save')}</Button>
            <Button size="sm" variant="ghost" onClick={onClose} isDisabled={busy}>{t('common:actions.cancel')}</Button>
          </HStack>
        </Box>
      )}
    </Box>
  )
}

// No Bonus category: which income category holds the bonuses (saved at once).
function BonusPicker({ income, onPick }) {
  const t = useT('salary')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!income.length) {
    return (
      <Text fontSize="sm" color="text.muted">
        {t('bonus.noneYet')}
        <Text as={RouterLink} to="/settings/categories/new?kind=income" color="accent.fg" fontWeight="600" ml={1}>{t('bonus.add')}</Text>
      </Text>
    )
  }
  async function pick(e) {
    if (!e.target.value) return
    setBusy(true)
    try { await onPick(e.target.value) } catch (err) { toast(saveErrorToast(err)) } finally { setBusy(false) }
  }
  return (
    <FormControl bg="bg.subtle" borderRadius="lg" px={3} py={2.5}>
      <FormLabel htmlFor="salary-bonus-cat" fontSize="sm" fontWeight="600" mb={1}>{t('bonus.label')}</FormLabel>
      <Text fontSize="xs" color="text.muted" mb={2}>{t('bonus.hint')}</Text>
      <Select id="salary-bonus-cat" size="sm" borderRadius="lg" bg="bg.surface" maxW="280px" isDisabled={busy}
        placeholder={t('bonus.choose')} value="" onChange={pick}>
        {income.map((c) => <option key={c.id} value={c.id}>{categoryDisplayName(c)}</option>)}
      </Select>
    </FormControl>
  )
}
