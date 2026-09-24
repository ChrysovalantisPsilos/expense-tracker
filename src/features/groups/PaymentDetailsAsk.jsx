import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react'
import { Landmark } from 'lucide-react'
import { getMyPaymentInfo } from '../../shared/lib/profile.js'
import { askForPaymentDetails } from '../../shared/lib/payLinks.js'
import { STORAGE_KEYS } from '../../shared/lib/keys.js'

const DISMISSED = STORAGE_KEYS.paymentAskDismissed

function wasDismissed() {
  try { return localStorage.getItem(DISMISSED) === '1' } catch { return false }
}

// Settle up's one-time ask, when you're the one being paid and friends have
// no way to pay you yet: add an IBAN, Revolut tag or PayPal.me name (Settings
// › Account › Getting paid), or "Not now", which this device remembers. It
// replaces the setup wizard's old payment step; the details stay editable in
// Settings. `direction` is the dialog's ('in' = you're being paid).
export default function PaymentDetailsAsk({ direction }) {
  const navigate = useNavigate()
  const [info, setInfo] = useState(null) // null until loaded (or if it fails)
  const [dismissed, setDismissed] = useState(wasDismissed)

  useEffect(() => {
    if (direction !== 'in' || dismissed || info) return
    let active = true
    getMyPaymentInfo().then((d) => { if (active) setInfo(d) }).catch(() => { /* just don't ask */ })
    return () => { active = false }
  }, [direction, dismissed, info])

  if (!askForPaymentDetails({ direction, info, dismissed })) return null

  function notNow() {
    try { localStorage.setItem(DISMISSED, '1') } catch { /* private mode: ask again next time */ }
    setDismissed(true)
  }

  return (
    <Box borderWidth="1px" borderColor="border.default" bg="bg.subtle" borderRadius="lg" p={3}>
      <HStack align="start" spacing={3}>
        <Box color="accent.fg" pt={0.5}><Landmark size={18} /></Box>
        <Stack spacing={2} flex="1" minW={0}>
          <Text fontSize="sm">
            Add your payment details so friends can pay you back in one tap.
          </Text>
          <HStack spacing={2} flexWrap="wrap">
            <Button size="sm" variant="outline" onClick={() => navigate('/settings/account')}>
              Add payment details
            </Button>
            <Button size="sm" variant="ghost" onClick={notNow}>Not now</Button>
          </HStack>
        </Stack>
      </HStack>
    </Box>
  )
}
