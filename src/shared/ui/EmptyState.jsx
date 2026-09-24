import { createContext, useContext, useEffect } from 'react'
import { Stack, Text } from '@chakra-ui/react'
import LooseRing from './LooseRing.jsx'

// A page's "nothing here yet" state: the Budgeer mark (LooseRing `variant`,
// "start" by default), a heading, one muted line, and the next step as
// `actions` (a primary Button, then an optional outline one). It sits inside
// the caller's Panel. Home, Transactions, Groups, a group's expenses,
// Budgets and Recurring all use it, so every empty page reads the same.
export default function EmptyState({ variant = 'start', title, text, actions }) {
  useEmptyStatePresence()
  return (
    <Stack align="center" textAlign="center" spacing={3} py={4}>
      <LooseRing variant={variant} w="140px" />
      <Text fontWeight="700" fontFamily="heading" fontSize="lg">{title}</Text>
      <Text color="text.muted" fontSize="sm" maxW="sm">{text}</Text>
      {actions && (
        <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} pt={2} w={{ base: 'full', sm: 'auto' }}>
          {actions}
        </Stack>
      )}
    </Stack>
  )
}

// The same, small, for an empty card among others (Home's Spending,
// Budgets and Subscriptions): a smaller mark, the muted line and at most one
// outline `action`. Unlike EmptyState it leaves the floating Add expense
// button alone — the rest of the page isn't empty.
export function CardEmptyState({ variant = 'start', text, action }) {
  return (
    <Stack align="center" textAlign="center" spacing={2} py={2}>
      <LooseRing variant={variant} w="84px" />
      <Text color="text.muted" fontSize="sm" maxW="sm" sx={{ textWrap: 'balance' }}>{text}</Text>
      {action}
    </Stack>
  )
}

// The app shell listens (EmptyStateCount.Provider, value: a `delta => void`
// counter) so the phone's floating Add expense button can step aside while an
// empty state is on the page: the empty state's own buttons are the next step
// there, and the floating one would otherwise sit over them on a short screen.
export const EmptyStateCount = createContext(null)

function useEmptyStatePresence() {
  const count = useContext(EmptyStateCount)
  useEffect(() => {
    if (!count) return undefined
    count(1)
    return () => count(-1)
  }, [count])
}
