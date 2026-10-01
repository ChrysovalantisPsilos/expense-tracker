// What the Home card and the Meal vouchers page both show of the next
// top-up: "+€176.00 on 5 Oct" over "September · 22 working days × €8.00".
import { Box, Text } from '@chakra-ui/react'
import { nextTopUpText } from './voucherText.js'

export function NextTopUp({ settings, next, align = 'left', size = 'sm', ...props }) {
  const words = nextTopUpText(settings, next)
  return (
    <Box textAlign={align} minW={0} {...props}>
      <Text fontWeight="700" color="status.positive" fontSize={size}>
        {words.amount}
      </Text>
      <Text fontSize="xs" color="text.muted">{words.why}</Text>
    </Box>
  )
}
