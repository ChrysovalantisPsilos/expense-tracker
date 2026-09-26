import { Box, FormControl, FormLabel, Input, Text } from '@chakra-ui/react'
import { formatMoney, formatRate, toBaseMinor } from '../lib/currency.js'
import { shortDate } from '../lib/dates.js'
import { useT } from '../lib/i18n/I18nProvider.jsx'
import { BusyNote } from './RingLoader.jsx'

// The conversion a foreign-currency entry will be saved with, shown BEFORE
// saving: "£42.50 ≈ €49.73 @ 1.1699 on 21 Aug". When no rate could be fetched
// (offline, very old date, API down) it asks for one instead — the form blocks
// the save until a rate exists, so nothing is ever booked at a made-up 1:1.
//
//   fx      — useFxRate() state, or { status: 'skipped' } when `captured` applies
//   captured — the rate already stored on the row being edited (kept as-is)
export default function FxPreview({ from, to, amountMinor, fx, captured, manual, onManual, rate }) {
  const t = useT()
  const convert = (r) => (amountMinor > 0
    ? `${formatMoney(amountMinor, from)} ≈ ${formatMoney(toBaseMinor(amountMinor, r, from, to), to)}`
    : `1 ${from} = ${formatRate(r)} ${to}`)
  // With an amount, the conversion and the rate it used.
  const conversion = (r) => (amountMinor > 0 ? `${convert(r)} @ ${formatRate(r)}` : convert(r))

  if (fx.status === 'loading') {
    return <BusyNote>{t('fx.loading', { from, to })}</BusyNote>
  }

  if (fx.status === 'skipped' && captured) {
    return (
      <Text fontSize="sm" color="text.muted" aria-live="polite">
        {t('fx.captured', { conversion: conversion(captured) })}
      </Text>
    )
  }

  if (fx.status === 'ok') {
    return (
      <Text fontSize="sm" color="text.muted" aria-live="polite" data-testid="fx-preview">
        {t('fx.ecb', { conversion: conversion(fx.rate), date: shortDate(fx.date) })}
      </Text>
    )
  }

  // missing: ask for the rate.
  return (
    <Box borderWidth="1px" borderColor="status.warning" bg="bg.subtle"
      borderRadius="md" p={3} data-testid="fx-missing">
      <Text fontSize="sm" mb={2}>{t('fx.missing', { from, to })}</Text>
      <FormControl isRequired>
        <FormLabel fontSize="sm" mb={1}>1 {from} = ? {to}</FormLabel>
        <Input size="sm" inputMode="decimal" autoComplete="off" value={manual}
          onChange={(e) => onManual(e.target.value)} placeholder={t('fx.ratePlaceholder')} maxW="160px" />
      </FormControl>
      {rate && amountMinor > 0 && (
        <Text fontSize="sm" color="text.muted" mt={2}>{conversion(rate)}</Text>
      )}
    </Box>
  )
}
