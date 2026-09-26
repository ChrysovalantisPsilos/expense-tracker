import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@chakra-ui/react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import EmptyState from '../../shared/ui/EmptyState.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Nothing logged yet (listHeading.isFirstRun): the mark with an empty ring
// and the two ways to start — add an expense, or import a bank statement.
// Home's Expenses card and the Transactions page show it.
export default function FirstEntry() {
  const t = useT('transactions')
  return (
    <EmptyState title={t('firstEntry.title')} text={t('firstEntry.text')}
      actions={<>
        <Button as={RouterLink} to="/transactions/new" leftIcon={<Plus size={18} />}>
          {t('firstEntry.add')}
        </Button>
        <Button as={RouterLink} to="/import" variant="outline" colorScheme="gray"
          leftIcon={<FileSpreadsheet size={18} />}>
          {t('firstEntry.import')}
        </Button>
      </>} />
  )
}
