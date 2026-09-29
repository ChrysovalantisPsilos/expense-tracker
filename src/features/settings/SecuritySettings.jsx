import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import SignInMethodsCard from './SignInMethodsCard.jsx'
import PasswordCard from './PasswordCard.jsx'
import PasskeysCard from './PasskeysCard.jsx'
import DeleteAccount from './DeleteAccount.jsx'
import { useIdentities, usePasskeys } from './signInData.js'
import { hasPasswordIdentity } from './authMethods.js'
import { useRecentSignIn } from './useRecentSignIn.js'
import ReauthNotice from './ReauthNotice.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import DemoNotice from './DemoNotice.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Sign-in methods (email & password, Google, passkeys), then the password and
// passkey cards, then account deletion. The passkey list is read once here
// for both the methods list and the passkeys card. Once the sign-in is more
// than a few minutes old, a notice on top offers a fresh one: adding a
// passkey, connecting or disconnecting Google and (without a password)
// deleting the account need it. On the shared demo login (0090) none of it
// is offered: the sign-in belongs to everyone who has it.
export default function SecuritySettings() {
  const t = useT('settings')
  const { isDemo } = useProfile()
  if (isDemo) {
    return (
      <SettingsSubPage title={t('security.title')}>
        <DemoNotice>{t('security.demo')}</DemoNotice>
      </SettingsSubPage>
    )
  }
  return <AccountSecurity />
}

function AccountSecurity() {
  const t = useT('settings')
  const { user } = useAuth()
  const identities = useIdentities()
  const passkeys = usePasskeys()
  const passkeyList = passkeys.error ? null : passkeys.data
  const recent = useRecentSignIn()
  const reason = hasPasswordIdentity(user) ? 'passkeyGoogle' : 'passkeyGoogleDelete'
  return (
    <SettingsSubPage title={t('security.title')}>
      {!recent && <Panel><ReauthNotice reason={reason} /></Panel>}
      <SignInMethodsCard user={user} identities={identities} passkeys={passkeyList} />
      <PasswordCard user={user} />
      <PasskeysCard passkeys={passkeys} />
      <DeleteAccount user={user} />
    </SettingsSubPage>
  )
}
