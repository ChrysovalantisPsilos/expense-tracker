// What the Home card and the Meal vouchers page both show of the next
// top-up: "+€176.00 on 5 Oct" over "September · 22 working days × €8.00".
import { Box, Text } from '@chakra-ui/react'
import { formatMoney } from '../../shared/lib/currency.js'
import { monthName, shortDate } from '../../shared/lib/dates.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A month's name from its key ('YYYY-MM').
export const monthOfKey = (key) => monthName(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1))

export function NextTopUp({ settings, next, align = 'left', size = 'sm', ...props }) {
  const t = useT('vouchers')
  const why = t('next.days', {
    month: monthOfKey(next.month), count: next.days, perDay: formatMoney(settings.per_day_minor, settings.currency),
  })
  return (
    <Box textAlign={align} minW={0} {...props}>
      <Text fontWeight="700" color="status.positive" fontSize={size}>
        {t('next.amount', { amount: formatMoney(next.amount_minor, settings.currency), date: shortDate(next.on) })}
      </Text>
      <Text fontSize="xs" color="text.muted">{next.fixed ? `${why} · ${t('next.fixed')}` : why}</Text>
    </Box>
  )
}
