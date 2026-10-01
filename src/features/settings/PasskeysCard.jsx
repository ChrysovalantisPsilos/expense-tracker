import { useState } from 'react'
import { Text, Button, useToast } from '@chakra-ui/react'
import { Fingerprint, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ItemRow from '../../shared/ui/kit/ItemRow.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { passkeyRows } from './authMethods.js'

// List / add / remove passkeys. `passkeys` is SecuritySettings' usePasskeys()
// (shared with the sign-in methods list). Renders nothing when this browser
// can't do WebAuthn or passkeys aren't enabled for the project (the list call
// errors), so users never see a dead feature. Removing a passkey never removes
// the last way in: every account also has an email or Google identity.
export default function PasskeysCard({ passkeys: query }) {
  const t = useT('settings')
  const { registerPasskey, deletePasskey } = useAuth()
  const toast = useToast()
  const [pkBusy, setPkBusy] = useState(false)
  const { data: passkeys, error, reload: loadPasskeys } = query

  async function addPasskey() {
    setPkBusy(true)
    const { error } = await registerPasskey()
    setPkBusy(false)
    if (error) {
      console.error('[passkeys] add failed:', error)
      toast({ title: t('passkeys.addFailed'), description: userMessage(error), status: 'error' })
      return
    }
    toast({ title: t('passkeys.added'), status: 'success' })
    loadPasskeys()
  }

  async function removePasskey(id) {
    const { error } = await deletePasskey(id)
    if (error) {
      console.error('[passkeys] remove failed:', error)
      toast({ title: userMessage(error, t('passkeys.removeFailed')), status: 'error' })
      return
    }
    loadPasskeys()
  }

  if (error || passkeys === null) return null

  return (
    <Panel title={t('passkeys.title')} icon={Fingerprint} action={
      <Button size="sm" leftIcon={<Plus size={14} />} isLoading={pkBusy}
        onClick={addPasskey}>{t('passkeys.add')}</Button>
    }>
      {passkeys.length === 0 ? (
        <Text fontSize="sm" color="text.muted">{t('passkeys.empty')}</Text>
      ) : (
        passkeyRows(passkeys).map((pk) => (
          <ItemRow key={pk.id} icon={KeyRound} title={pk.name} meta={pk.meta ?? undefined}
            actions={[{ label: t('passkeys.remove'), icon: Trash2, onClick: () => removePasskey(pk.id), danger: true }]} />
        ))
      )}
    </Panel>
  )
}
