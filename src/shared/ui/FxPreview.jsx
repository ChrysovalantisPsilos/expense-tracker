import { Box, FormControl, FormLabel, Input, Text } from '@chakra-ui/react'
import { formatMoney, formatRate, toBaseMinor } from '../lib/currency.js'
import { shortDate } from '../lib/dates.js'
import { BusyNote } from './RingLoader.jsx'

// The conversion a foreign-currency entry will be saved with, shown BEFORE
// saving: "£42.50 ≈ €49.73 @ 1.1699 on 21 Aug". When no rate could be fetched
// (offline, very old date, API down) it asks for one instead — the form blocks
// the save until a rate exists, so nothing is ever booked at a made-up 1:1.
//
//   fx      — useFxRate() state, or { status: 'skipped' } when `captured` applies
//   captured — the rate already stored on the row being edited (kept as-is)
export default function FxPreview({ from, to, amountMinor, fx, captured, manual, onManual, rate }) {
  const convert = (r) => (amountMinor > 0
    ? `${formatMoney(amountMinor, from)} ≈ ${formatMoney(toBaseMinor(amountMinor, r, from, to), to)}`
    : `1 ${from} = ${formatRate(r)} ${to}`)

  if (fx.status === 'loading') {
    return <BusyNote>Looking up the {from}→{to} rate…</BusyNote>
  }

  if (fx.status === 'skipped' && captured) {
    return (
      <Text fontSize="sm" color="text.muted" aria-live="polite">
        {amountMinor > 0 ? `${convert(captured)} @ ${formatRate(captured)}` : convert(captured)}
        {' '}(the rate it was saved with)
      </Text>
    )
  }

  if (fx.status === 'ok') {
    return (
      <Text fontSize="sm" color="text.muted" aria-live="polite" data-testid="fx-preview">
        {amountMinor > 0 ? `${convert(fx.rate)} @ ${formatRate(fx.rate)}` : convert(fx.rate)}
        {' '}on {shortDate(fx.date)} (ECB)
      </Text>
    )
  }

  // missing: ask for the rate.
  return (
    <Box borderWidth="1px" borderColor="status.warning" bg="bg.subtle"
      borderRadius="md" p={3} data-testid="fx-missing">
      <Text fontSize="sm" mb={2}>
        Couldn’t get the {from}→{to} exchange rate for this date. Enter the rate
        to save it — you’ll find it on your card or bank statement.
      </Text>
      <FormControl isRequired>
        <FormLabel fontSize="sm" mb={1}>1 {from} = ? {to}</FormLabel>
        <Input size="sm" inputMode="decimal" autoComplete="off" value={manual}
          onChange={(e) => onManual(e.target.value)} placeholder="e.g. 1.17" maxW="160px" />
      </FormControl>
      {rate && amountMinor > 0 && (
        <Text fontSize="sm" color="text.muted" mt={2}>{convert(rate)} @ {formatRate(rate)}</Text>
      )}
    </Box>
  )
}
