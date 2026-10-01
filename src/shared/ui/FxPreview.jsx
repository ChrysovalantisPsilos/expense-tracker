import { Box, FormControl, FormLabel, Input, Text } from '@chakra-ui/react'
import { fxPreview } from '../lib/fxPreview.js'
import { useT } from '../lib/i18n/I18nProvider.jsx'
import { BusyNote } from './RingLoader.jsx'

// The conversion a foreign-currency entry will be saved with, shown BEFORE
// saving: "£42.50 ≈ €49.73 @ 1.1699 on 21 Aug". When no rate could be fetched
// (offline, very old date, API down) it asks for one instead — the form blocks
// the save until a rate exists, so nothing is ever booked at a made-up 1:1.
// The wording is fxPreview's (the native form says the same).
//
//   fx      — useFxRate() state, or { status: 'skipped' } when `captured` applies
//   captured — the rate already stored on the row being edited (kept as-is)
export default function FxPreview({ from, to, amountMinor, fx, captured, manual, onManual, rate }) {
  const t = useT()
  const shown = fxPreview({ from, to, amountMinor, fx, captured, rate })

  if (shown.status === 'loading') return <BusyNote>{shown.text}</BusyNote>

  if (shown.status !== 'missing') {
    return (
      <Text fontSize="sm" color="text.muted" aria-live="polite"
        data-testid={shown.status === 'ecb' ? 'fx-preview' : undefined}>
        {shown.text}
      </Text>
    )
  }

  // missing: ask for the rate.
  return (
    <Box borderWidth="1px" borderColor="status.warning" bg="bg.subtle"
      borderRadius="md" p={3} data-testid="fx-missing">
      <Text fontSize="sm" mb={2}>{shown.text}</Text>
      <FormControl isRequired>
        <FormLabel fontSize="sm" mb={1}>{shown.label}</FormLabel>
        <Input size="sm" inputMode="decimal" autoComplete="off" value={manual}
          onChange={(e) => onManual(e.target.value)} placeholder={t('fx.ratePlaceholder')} maxW="160px" />
      </FormControl>
      {shown.conversion && (
        <Text fontSize="sm" color="text.muted" mt={2}>{shown.conversion}</Text>
      )}
    </Box>
  )
}
