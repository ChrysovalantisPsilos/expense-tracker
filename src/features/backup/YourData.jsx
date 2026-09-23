import SettingsPage from '../settings/SettingsPage.jsx'
import ExportBackup from './ExportBackup.jsx'
import RestoreBackup from './RestoreBackup.jsx'

// Settings → Your data: download a backup of the account, or merge one back in.
export default function YourData() {
  return (
    <SettingsPage title="Your data" description="Back up or restore your account">
      <ExportBackup />
      <RestoreBackup />
    </SettingsPage>
  )
}
