import { Link as RouterLink } from 'react-router-dom'
import { Button, Text } from '@chakra-ui/react'
import { Download, Upload } from 'lucide-react'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Settings → Your data: download a backup of the account, or merge one back
// in. Each opens its own page (ExportBackupPage, RestoreBackupPage).
export default function YourData() {
  const t = useT('backup')
  return (
    <SettingsSubPage title={t('settings:rows.data.label')} description={t('settings:rows.data.desc')}>
      <Panel title={t('export.title')} icon={Download}>
        <Text fontSize="sm" color="text.muted" mb={4}>{t('export.lead')}</Text>
        <Button as={RouterLink} to="/settings/data/export" leftIcon={<Download size={16} />}>
          {t('export.title')}
        </Button>
      </Panel>
      <Panel title={t('restore.title')} icon={Upload}>
        <Text fontSize="sm" color="text.muted" mb={4}>{t('restore.lead')}</Text>
        <Button as={RouterLink} to="/settings/data/restore" variant="outline" leftIcon={<Upload size={16} />}>
          {t('restore.title')}
        </Button>
      </Panel>
    </SettingsSubPage>
  )
}
