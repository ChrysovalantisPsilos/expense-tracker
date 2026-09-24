import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@chakra-ui/react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import EmptyState from '../../shared/ui/EmptyState.jsx'

// Nothing logged yet (listHeading.isFirstRun): the mark with an empty ring
// and the two ways to start — add an expense, or import a bank statement.
// Home's Expenses card and the Transactions page show it.
export default function FirstEntry() {
  return (
    <EmptyState title="Nothing logged yet"
      text="Add what you spend as it happens, or bring in your history from a bank statement."
      actions={<>
        <Button as={RouterLink} to="/transactions/new" leftIcon={<Plus size={18} />}>
          Add your first expense
        </Button>
        <Button as={RouterLink} to="/import" variant="outline" colorScheme="gray"
          leftIcon={<FileSpreadsheet size={18} />}>
          Import a bank statement
        </Button>
      </>} />
  )
}
