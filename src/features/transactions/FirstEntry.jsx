import { Link as RouterLink } from 'react-router-dom'
import { Button, Stack, Text } from '@chakra-ui/react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import LooseRing from '../../shared/ui/LooseRing.jsx'

// Nothing logged yet (listHeading.isFirstRun): the mark with an empty ring
// and the two ways to start — add an expense, or import a bank statement.
// Home's Expenses card and the Transactions page show it.
export default function FirstEntry() {
  return (
    <Stack align="center" textAlign="center" spacing={3} py={4}>
      <LooseRing variant="start" w="140px" />
      <Text fontWeight="700" fontFamily="heading" fontSize="lg">Nothing logged yet</Text>
      <Text color="text.muted" fontSize="sm" maxW="sm">
        Add what you spend as it happens, or bring in your history from a bank statement.
      </Text>
      <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} pt={2} w={{ base: 'full', sm: 'auto' }}>
        <Button as={RouterLink} to="/transactions/new" leftIcon={<Plus size={18} />}>
          Add your first expense
        </Button>
        <Button as={RouterLink} to="/import" variant="outline" colorScheme="gray"
          leftIcon={<FileSpreadsheet size={18} />}>
          Import a bank statement
        </Button>
      </Stack>
    </Stack>
  )
}
