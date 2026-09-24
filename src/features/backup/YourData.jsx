import { Link as RouterLink } from 'react-router-dom'
import { Button, Text } from '@chakra-ui/react'
import { Download, Upload } from 'lucide-react'
import SettingsPage from '../settings/SettingsPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'

// Settings → Your data: download a backup of the account, or merge one back
// in. Each opens its own page (ExportBackupPage, RestoreBackupPage).
export default function YourData() {
  return (
    <SettingsPage title="Your data" description="Back up or restore your account">
      <Panel title="Export backup" icon={Download}>
        <Text fontSize="sm" color="text.muted" mb={4}>
          Download one file with your expenses and income, categories and rules,
          budgets, recurring entries, accounts, savings goals, settings and payment
          details — plus a read-only record of your groups.
        </Text>
        <Button as={RouterLink} to="/settings/data/export" leftIcon={<Download size={16} />}>
          Export backup
        </Button>
      </Panel>
      <Panel title="Restore from backup" icon={Upload}>
        <Text fontSize="sm" color="text.muted" mb={4}>
          Adds what’s missing from a Budgeer backup file to this account. Nothing
          is deleted or overwritten, and entries you already have are skipped — so
          it’s safe to run more than once.
        </Text>
        <Button as={RouterLink} to="/settings/data/restore" variant="outline" leftIcon={<Upload size={16} />}>
          Restore from backup
        </Button>
      </Panel>
    </SettingsPage>
  )
}
