import { useEffect, useState } from 'react'
import {
  Stack, SimpleGrid, Button, FormControl, FormLabel, Input, useToast, Text,
} from '@chakra-ui/react'
import { Landmark } from 'lucide-react'
import { getMyPaymentInfo, savePaymentInfo } from '../../shared/lib/profile.js'
import { normalisePaypalHandle } from '../../shared/lib/payLinks.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// An example IBAN (data, not words: the same in every language).
const IBAN_EXAMPLE = 'BE68 5390 0754 7034'

// "Getting paid": the IBAN / Revolut tag / PayPal.me name friends see when
// settling up.
export default function PaymentCard({ user }) {
  const t = useT('settings')
  const toast = useToast()
  const [iban, setIban] = useState('')
  const [revolut, setRevolut] = useState('')
  const [paypal, setPaypal] = useState('')
  const [loaded, setLoaded] = useState(false)
  const { busy, run } = useAsyncSubmit()

  useEffect(() => {
    let active = true
    getMyPaymentInfo().then((data) => {
      if (!active) return
      setIban(data.payment_iban ?? '')
      setRevolut(data.payment_revolut ?? '')
      setPaypal(data.payment_paypal ?? '')
      setLoaded(true)
    }).catch(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user.id])

  async function save(e) {
    e.preventDefault()
    const paypalName = paypal.trim() ? normalisePaypalHandle(paypal) : null
    if (paypal.trim() && !paypalName) {
      toast({ title: t('payment.paypalInvalid'), status: 'warning' })
      return
    }
    await run(async () => {
      await savePaymentInfo({
        iban: iban.replace(/\s+/g, '').toUpperCase() || null,
        revolut: revolut.replace(/^@/, '').trim() || null,
        paypal: paypalName,
      })
      setPaypal(paypalName ?? '')
      toast({ title: t('payment.saved'), status: 'success' })
    })
  }

  return (
    <Panel title={t('payment.title')} icon={Landmark}>
      <Text fontSize="sm" color="text.muted" mb={4}>{t('payment.lead')}</Text>
      {!loaded ? (
        <RingLoader compact />
      ) : (
        <Stack spacing={4} as="form" onSubmit={save}>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <FormControl>
              <FormLabel>{t('payment.iban')}</FormLabel>
              <Input value={iban} onChange={(e) => setIban(e.target.value)}
                placeholder={IBAN_EXAMPLE} autoComplete="off" />
            </FormControl>
            <FormControl>
              <FormLabel>{t('payment.revolut')}</FormLabel>
              <Input value={revolut} onChange={(e) => setRevolut(e.target.value)}
                placeholder={t('payment.revolutPlaceholder')} autoComplete="off" />
            </FormControl>
            <FormControl>
              <FormLabel>{t('payment.paypal')}</FormLabel>
              <Input value={paypal} onChange={(e) => setPaypal(e.target.value)}
                placeholder={t('payment.paypalPlaceholder')} autoComplete="off" />
            </FormControl>
          </SimpleGrid>
          <Button type="submit" size="sm" alignSelf="start" isLoading={busy}>{t('common:actions.save')}</Button>
        </Stack>
      )}
    </Panel>
  )
}
