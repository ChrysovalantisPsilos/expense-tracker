import { useEffect, useState } from 'react'
import {
  Box, Button, Center, HStack, Image, Text, useToast,
} from '@chakra-ui/react'
import { ExternalLink, Info, QrCode, Copy } from 'lucide-react'
import { memberPaymentInfo } from './groups.js'
import { revolutUrl, paypalUrl, sepaQrPayload } from '../../shared/lib/payLinks.js'
import { copyText } from '../../shared/lib/clipboard.js'
import { intlLocale } from '../../shared/lib/i18n/i18n.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Brand names: the same in every language.
const REVOLUT = 'Revolut'
const PAYPAL = 'PayPal'

// One-tap ways to actually pay a co-member the settle-up amount, driven by
// the payment details they saved in Settings → Account → Getting paid (readable to
// co-members). Without any (or before they've joined), the box says what it
// would offer, so people learn the option exists. Revolut and PayPal links open with the amount filled in. The
// SEPA "Bank QR" encodes an EPC069-12 payload — scanning it
// in any EU banking app pre-fills payee, IBAN, and the exact amount (EPC
// transfers are EUR-only, so it hides for other group currencies).
export default function PayShortcuts({ member, amountMinor, currency, groupName }) {
  const toast = useToast()
  const t = useT('groups')
  const [info, setInfo] = useState(null)
  const [qr, setQr] = useState(null) // { payload, url }
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    setInfo(null); setQr(null); setShowQr(false)
    if (!member?.user_id) return
    let active = true
    memberPaymentInfo(member.id)
      .then((data) => { if (active) setInfo(data) })
      .catch(() => { if (active) setInfo({}) })
    return () => { active = false }
  }, [member?.id, member?.user_id])

  const iban = info?.payment_iban
  const eur = currency === 'EUR'
  // "12.50" (English, as before) or "12,50" (Greek), for the QR's caption.
  const amountStr = intlLocale()
    ? (amountMinor / 100).toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (amountMinor / 100).toFixed(2)
  // The QR belongs to one payload: a new amount (or payee) builds a new one,
  // so a stale code is never shown.
  const payload = iban && eur ? sepaQrPayload({
    name: member?.display_name, iban, amountMinor, reference: `Budgeer settle-up · ${groupName ?? ''}`,
  }) : null

  useEffect(() => {
    if (!showQr || !payload || qr?.payload === payload) return
    let active = true
    // The QR encoder is only fetched the first time someone asks for one.
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(payload, { margin: 1, width: 220 }))
      .then((url) => { if (active) setQr({ payload, url }) })
      .catch(() => {
        if (!active) return
        setShowQr(false)
        toast({ title: t('pay.qrFailed'), status: 'error' })
      })
    return () => { active = false }
  }, [showQr, payload, qr?.payload, toast, t])

  const revolut = revolutUrl(info?.payment_revolut, amountMinor, currency)
  const paypal = paypalUrl(info?.payment_paypal, amountMinor, currency)
  if (!member) return null
  // No details (yet): say what this box would offer, so people know it exists.
  // Not shown while the details are still loading.
  if (!member.user_id || (info && !iban && !revolut && !paypal)) {
    return (
      <Box borderWidth="1px" borderColor="border.default" borderRadius="lg" p={3}>
        <HStack spacing={2} mb={1}>
          <Info size={15} aria-hidden />
          <Text fontSize="sm" fontWeight="600">{t('pay.direct', { name: member.display_name })}</Text>
        </HStack>
        <Text fontSize="xs" color="text.muted">
          {t(member.user_id ? 'pay.noDetails' : 'pay.notJoined', { name: member.display_name })}
        </Text>
      </Box>
    )
  }
  if (!info) return null

  const qrUrl = showQr && qr?.payload === payload ? qr.url : null

  async function copyIban() {
    if (await copyText(iban)) toast({ title: t('pay.ibanCopied'), status: 'success' })
    else toast({ title: iban, status: 'info', duration: 8000 })
  }

  return (
    <Box borderWidth="1px" borderColor="border.default" borderRadius="lg" p={3}>
      <Text fontSize="sm" fontWeight="600" mb={2}>
        {t('pay.direct', { name: member.display_name })}
      </Text>
      <HStack spacing={2} flexWrap="wrap">
        {revolut && (
          <Button as="a" size="sm" target="_blank" rel="noopener noreferrer" href={revolut}
            rightIcon={<ExternalLink size={13} />}>
            {REVOLUT}
          </Button>
        )}
        {paypal && (
          <Button as="a" size="sm" target="_blank" rel="noopener noreferrer" href={paypal}
            rightIcon={<ExternalLink size={13} />}>
            {PAYPAL}
          </Button>
        )}
        {payload && (
          <Button size="sm" variant="outline" leftIcon={<QrCode size={14} />} onClick={() => setShowQr((v) => !v)}>
            {t(showQr ? 'pay.hideQr' : 'pay.showQr')}
          </Button>
        )}
        {iban && (
          <Button size="sm" variant="ghost" leftIcon={<Copy size={14} />} onClick={copyIban}>
            {t('pay.copyIban')}
          </Button>
        )}
      </HStack>
      {qrUrl && (
        <Center pt={3} flexDirection="column">
          {/* White backing keeps the QR scannable in dark mode. */}
          <Image src={qrUrl} boxSize="200px" borderRadius="md" bg="white" p={2} alt={t('pay.qrAlt')} />
          <Text fontSize="xs" color="text.muted" mt={2}>
            {t('pay.scan', { amount: amountStr })}
          </Text>
        </Center>
      )}
      <Text fontSize="xs" color="text.muted" mt={2}>
        {t('pay.afterPaying')}
      </Text>
    </Box>
  )
}
