import { Box, HStack, Stack, Tag, Text } from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY, budgetsDemo } from './landingDemo.js'
import MockCard from './MockCard.jsx'
import { MotionBox, usePlayback } from './motion.jsx'

const BUDGETS = budgetsDemo()
const money = (minor) => formatMoney(minor, DEMO_CURRENCY)

// Monthly budgets whose progress bars fill when scrolled into view.
export default function BudgetsMock() {
  const { ref, reduce, inView } = usePlayback({ once: true })
  return (
    <MockCard title="September budgets" playbackRef={ref}
      label="Example monthly budgets: progress bars per category, with Dining out over budget.">
      <Stack spacing={4}>
        {BUDGETS.map((b, i) => {
          const over = b.pct > 100
          const width = `${Math.min(b.pct, 100)}%`
          return (
            <Box key={b.category}>
              <HStack spacing={3} mb={2}>
                <CategoryBadge category={b.category} size={32} />
                <Box flex="1" minW={0}>
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{b.category}</Text>
                  <Text fontSize="xs" color="text.muted">
                    {money(b.spentMinor)} of {money(b.capMinor)}
                  </Text>
                </Box>
                {over ? (
                  <Tag size="sm" colorScheme="red" borderRadius="full">Over budget</Tag>
                ) : (
                  <Text fontSize="sm" fontWeight="700" color="text.muted">{b.pct}%</Text>
                )}
              </HStack>
              <Box h="8px" borderRadius="full" bg="bg.subtle" overflow="hidden">
                <MotionBox
                  h="full" borderRadius="full" bg={over ? 'red.400' : 'brand.500'}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: reduce || inView ? width : 0 }}
                  transition={{ duration: 0.9, delay: 0.15 * i, ease: 'easeOut' }}
                />
              </Box>
            </Box>
          )
        })}
      </Stack>
    </MockCard>
  )
}
