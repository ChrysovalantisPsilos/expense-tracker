import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import SettingsPage from './SettingsPage.jsx'
import SignInMethodsCard from './SignInMethodsCard.jsx'
import PasswordCard from './PasswordCard.jsx'
import PasskeysCard from './PasskeysCard.jsx'
import DeleteAccount from './DeleteAccount.jsx'
import { useIdentities, usePasskeys } from './signInData.js'

// Sign-in methods (email & password, Google, passkeys), then the password and
// passkey cards, then account deletion. The passkey list is read once here
// for both the methods list and the passkeys card.
export default function SecuritySettings() {
  const { user } = useAuth()
  const identities = useIdentities()
  const passkeys = usePasskeys()
  const passkeyList = passkeys.error ? null : passkeys.data
  return (
    <SettingsPage title="Security">
      <SignInMethodsCard user={user} identities={identities} passkeys={passkeyList} />
      <PasswordCard user={user} />
      <PasskeysCard passkeys={passkeys} />
      <DeleteAccount user={user} />
    </SettingsPage>
  )
}
