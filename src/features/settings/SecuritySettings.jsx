import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import SettingsPage from './SettingsPage.jsx'
import SignInMethodsCard from './SignInMethodsCard.jsx'
import PasswordCard from './PasswordCard.jsx'
import PasskeysCard from './PasskeysCard.jsx'
import DeleteAccount from './DeleteAccount.jsx'
import { useIdentities, usePasskeys } from './signInData.js'
import { hasPasswordIdentity } from './authMethods.js'
import { useRecentSignIn } from './useRecentSignIn.js'
import ReauthNotice from './ReauthNotice.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'

// Sign-in methods (email & password, Google, passkeys), then the password and
// passkey cards, then account deletion. The passkey list is read once here
// for both the methods list and the passkeys card. Once the sign-in is more
// than a few minutes old, a notice on top offers a fresh one: adding a
// passkey, connecting or disconnecting Google and (without a password)
// deleting the account need it.
export default function SecuritySettings() {
  const { user } = useAuth()
  const identities = useIdentities()
  const passkeys = usePasskeys()
  const passkeyList = passkeys.error ? null : passkeys.data
  const recent = useRecentSignIn()
  const what = hasPasswordIdentity(user)
    ? 'add a passkey or change your Google connection'
    : 'add a passkey, change your Google connection or delete your account'
  return (
    <SettingsPage title="Security">
      {!recent && <Panel><ReauthNotice what={what} /></Panel>}
      <SignInMethodsCard user={user} identities={identities} passkeys={passkeyList} />
      <PasswordCard user={user} />
      <PasskeysCard passkeys={passkeys} />
      <DeleteAccount user={user} />
    </SettingsPage>
  )
}
