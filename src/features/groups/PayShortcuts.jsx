import { useEffect, useState } from 'react'
import {
  Box, Button, Center, HStack, Image, Text, useToast,
} from '@chakra-ui/react'
import QRCode from 'qrcode'
import { ExternalLink, QrCode, Copy } from 'lucide-react'
import { memberPaymentInfo } from './groups.js'

// One-tap ways to actually pay a co-member the settle-up amount, driven by
// the payment details they saved in Settings → Account → Getting paid (readable to
// co-members). The SEPA "Bank QR" encodes an EPC069-12 payload — scanning it
// in any EU banking app pre-fills payee, IBAN, and the exact amount (EPC
// transfers are EUR-only, so it hides for other group currencies).
export default function PayShortcuts({ member, amountMinor, currency, groupName }) {
  const toast = useToast()
  const [info, setInfo] = useState(null)
  const [qr, setQr] = useState(null)
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
  const revolut = info?.payment_revolut
  if (!member?.user_id || (!iban && !revolut)) return null

  const eur = currency === 'EUR'
  const amountStr = (amountMinor / 100).toFixed(2)

  async function toggleQr() {
    if (showQr) { setShowQr(false); return }
    try {
      if (!qr) {
        const payload = [
          'BCD', '002', '1', 'SCT', '',
          (member.display_name || 'Payee').slice(0, 70),
          iban,
          `EUR${amountStr}`,
          '', '',
          `Budgeer settle-up · ${groupName ?? ''}`.slice(0, 140),
        ].join('\n')
        setQr(await QRCode.toDataURL(payload, { margin: 1, width: 220 }))
      }
      setShowQr(true)
    } catch {
      toast({ title: 'Couldn’t build the QR code', status: 'error' })
    }
  }

  async function copyIban() {
    try {
      await navigator.clipboard.writeText(iban)
      toast({ title: 'IBAN copied', status: 'success' })
    } catch {
      toast({ title: iban, status: 'info', duration: 8000 })
    }
  }

  return (
    <Box borderWidth="1px" borderColor="border.default" borderRadius="lg" p={3}>
      <Text fontSize="sm" fontWeight="600" mb={2}>
        Pay {member.display_name} directly
      </Text>
      <HStack spacing={2} flexWrap="wrap">
        {revolut && (
          <Button as="a" size="sm" target="_blank" rel="noopener"
            href={`https://revolut.me/${encodeURIComponent(revolut)}`}
            rightIcon={<ExternalLink size={13} />}>
            Revolut
          </Button>
        )}
        {iban && eur && (
          <Button size="sm" variant="outline" leftIcon={<QrCode size={14} />} onClick={toggleQr}>
            {showQr ? 'Hide bank QR' : 'Bank QR'}
          </Button>
        )}
        {iban && (
          <Button size="sm" variant="ghost" leftIcon={<Copy size={14} />} onClick={copyIban}>
            Copy IBAN
          </Button>
        )}
      </HStack>
      {showQr && qr && (
        <Center pt={3} flexDirection="column">
          {/* White backing keeps the QR scannable in dark mode. */}
          <Image src={qr} boxSize="200px" borderRadius="md" bg="white" p={2} alt="SEPA payment QR" />
          <Text fontSize="xs" color="text.muted" mt={2}>
            Scan with your banking app — payee and {amountStr} EUR are pre-filled.
          </Text>
        </Center>
      )}
      <Text fontSize="xs" color="text.muted" mt={2}>
        After paying, hit Record below so the group’s books match.
      </Text>
    </Box>
  )
}
