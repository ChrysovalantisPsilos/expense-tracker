// Settings → Meal vouchers: whether the user gets them, the amount per
// working day, whose working days (Belgium or Greece: Mon–Fri minus that
// country's public holidays), the day the top-up lands, and what's on the
// card today. Saving starts the card's count again from today
// (voucherMath.newSettings); switching off removes the setup.
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Button, FormControl, FormErrorMessage, FormHelperText, FormLabel, HStack, Input, Select, Stack, Switch, useToast,
} from '@chakra-ui/react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import { minorToInput, toMinor } from '../../shared/lib/currency.js'
import { today } from '../../shared/lib/dates.js'
import { saveErrorToast } from '../../shared/lib/saveError.js'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { COUNTRIES, firstTopUpDate, newSettings } from './voucherMath.js'
import { saveMealVouchers, useMealVouchers, useVoucherCard } from './vouchers.js'

export default function VoucherSetup() {
  const t = useT('vouchers')
  const { settings, loading, error, reload } = useMealVouchers()
  const card = useVoucherCard(settings)
  let body
  if (error) body = <QueryError error={error} onRetry={reload} what={t('what')} />
  else if (loading || (settings && card.loading)) body = <RingLoader compact />
  else body = <SetupForm settings={settings} balance={card.card?.summary.balance ?? 0} />
  return (
    <SettingsSubPage title={t('setup.title')} description={t('setup.lead')}>
      <Panel>{body}</Panel>
    </SettingsSubPage>
  )
}

function SetupForm({ settings, balance }) {
  const t = useT('vouchers')
  const toast = useToast()
  const navigate = useNavigate()
  const fromCard = useLocation().state?.from === 'vouchers'
  const back = useGoBack('/settings')
  const { user } = useAuth()
  const { baseCurrency } = useProfile()
  const currency = settings?.currency ?? baseCurrency
  const [on, setOn] = useState(!!settings)
  const [perDay, setPerDay] = useState(settings ? minorToInput(settings.per_day_minor, currency) : '')
  const [country, setCountry] = useState(settings?.country ?? 'BE')
  // Picked on a calendar as the next top-up's date; its day repeats monthly.
  const [topUpOn, setTopUpOn] = useState(firstTopUpDate(settings, today()))
  const [onCard, setOnCard] = useState(minorToInput(Math.max(balance, 0), currency))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const perDayMinor = Number(perDay) > 0 ? toMinor(perDay, currency) : 0
  const missing = on && perDayMinor <= 0

  async function save() {
    setTried(true)
    if (missing) return
    setBusy(true)
    try {
      if (on) {
        const next = newSettings({
          country, per_day_minor: perDayMinor, currency, topup_day: Number(topUpOn.slice(8, 10)),
          balance_minor: Number(onCard) > 0 ? toMinor(onCard, currency) : 0,
        }, settings, today())
        await saveMealVouchers(user.id, next)
        toast({ title: t('setup.saved'), status: 'success' })
        // Back to the card when it opened this page; from Settings, on to the
        // card in this page's place (so its back leads to Settings).
        if (fromCard) navigate(-1)
        else navigate('/vouchers', { replace: true })
      } else {
        await saveMealVouchers(user.id, null)
        toast({ title: t('setup.off'), description: settings ? t('setup.offHint') : undefined, status: 'success' })
        back()
      }
    } catch (err) {
      toast(saveErrorToast(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={5}>
      <FormControl>
        <HStack justify="space-between" spacing={4}>
          <FormLabel htmlFor="vouchers-on" mb={0}>{t('setup.on')}</FormLabel>
          <Switch id="vouchers-on" isChecked={on} onChange={(e) => setOn(e.target.checked)} />
        </HStack>
      </FormControl>
      {on && (
        <>
          <FormControl isRequired isInvalid={tried && missing}>
            <FormLabel>{t('setup.perDay')}</FormLabel>
            <MoneyInput currency={currency} value={perDay} onChange={setPerDay} maxW="180px" />
            <FormErrorMessage>{t('setup.needAmount')}</FormErrorMessage>
            <FormHelperText>{t('setup.perDayHint')}</FormHelperText>
          </FormControl>
          <FormControl>
            <FormLabel>{t('setup.country')}</FormLabel>
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{t(`setup.countries.${c}`)}</option>)}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel htmlFor="vouchers-topup">{t('setup.topUpDate')}</FormLabel>
            <Input id="vouchers-topup" type="date" value={topUpOn} maxW="220px"
              onChange={(e) => { if (e.target.value) setTopUpOn(e.target.value) }} />
            <FormHelperText>{t('setup.topUpDateHint')}</FormHelperText>
          </FormControl>
          <FormControl>
            <FormLabel>{t('setup.balance')}</FormLabel>
            <MoneyInput currency={currency} value={onCard} onChange={setOnCard} maxW="180px" />
            <FormHelperText>{t('setup.balanceHint')}</FormHelperText>
          </FormControl>
        </>
      )}
      <HStack>
        <Button onClick={save} isLoading={busy}>{t('setup.save')}</Button>
      </HStack>
    </Stack>
  )
}
