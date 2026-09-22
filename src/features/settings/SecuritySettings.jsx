import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import SettingsPage from './SettingsPage.jsx'
import PasswordCard from './PasswordCard.jsx'
import PasskeysCard from './PasskeysCard.jsx'
import DeleteAccount from './DeleteAccount.jsx'

export default function SecuritySettings() {
  const { user } = useAuth()
  return (
    <SettingsPage title="Security">
      <PasswordCard user={user} />
      <PasskeysCard />
      <DeleteAccount user={user} />
    </SettingsPage>
  )
}
