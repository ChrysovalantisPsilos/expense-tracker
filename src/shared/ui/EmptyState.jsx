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
