import { useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Button, FormControl, FormLabel, Input, ListItem, Stack, Text, UnorderedList, useDisclosure,
} from '@chakra-ui/react'
import { Download, RotateCcw } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { startFresh } from '../../shared/lib/profile.js'
import { liveQueryCache } from '../../shared/lib/queryCache.js'
import { clearCachedReads } from '../../shared/lib/userDataCaches.js'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import FormModal from '../../shared/ui/FormModal.jsx'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { useRecentSignIn } from '../settings/useRecentSignIn.js'
import ReauthNotice from '../settings/ReauthNotice.jsx'
import { START_FRESH_PHRASE, startFreshCheck, startFreshScope } from './startFreshMath.js'
import Note from './Note.jsx'

// Settings › Your data's Start fresh: wipe your own data and keep the account
// (start_fresh, 0112). Hidden on the shared demo login, which the server
// refuses anyway. The confirmation offers a backup first, then asks for START
// FRESH and the password (or a recent sign-in), as Delete account does.
export default function StartFresh() {
  const t = useT('backup')
  const { isDemo } = useProfile()
  const modal = useDisclosure()
  if (isDemo) return null
  return (
    <Panel title={t('startFresh.title')} icon={RotateCcw} iconTone="negative" borderColor="status.negativeBorder">
      <Text fontSize="sm" color="text.muted" mb={4}>{t('startFresh.lead')}</Text>
      <Button colorScheme="red" variant="outline" leftIcon={<RotateCcw size={16} />} onClick={modal.onOpen}>
        {t('startFresh.open')}
      </Button>
      <StartFreshModal isOpen={modal.isOpen} onClose={modal.onClose} />
    </Panel>
  )
}

function StartFreshModal({ isOpen, onClose }) {
  const t = useT('backup')
  const { session } = useAuth()
  const user = session?.user
  const recent = useRecentSignIn()
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const { busy, run } = useAsyncSubmit()
  const phraseRef = useRef(null)
  const check = startFreshCheck({ user, recent, phrase, password })
  const scope = startFreshScope()

  async function confirm() {
    if (!check.canSubmit) return
    await run(async () => {
      await startFresh({
        email: user?.email, password: check.password ? password : null, wrongPassword: t('startFresh.wrongPassword'),
      })
      // Nothing read before may show again: the pages' last answers, the
      // service worker's offline copies; then Home, loaded anew.
      liveQueryCache.clear()
      await clearCachedReads()
      window.location.replace('/')
    }, { errorTitle: t('startFresh.failed') })
  }

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title={t('startFresh.confirmTitle')} onSubmit={confirm}
      busy={busy} submitLabel={t('startFresh.submit')} initialFocusRef={phraseRef} scrollBehavior="inside"
      submitProps={{
        colorScheme: 'red', isDisabled: !check.canSubmit, loadingText: t('startFresh.working'), spinner: <RingSpinner />,
      }}>
      <Stack spacing={4}>
        <Text color="text.muted" fontSize="sm">{t('startFresh.warning')}</Text>
        <ScopeList title={t('startFresh.wipedList')} lines={scope.wiped} />
        <ScopeList title={t('startFresh.keptList')} lines={scope.kept} />
        <Box>
          <Text fontWeight="600" fontSize="sm" color="text.primary" mb={2}>{t('startFresh.backupTitle')}</Text>
          <Note icon={Download} tone="warning">{t('startFresh.backupLead')}</Note>
          <Button as={RouterLink} to="/settings/data/export" size="sm" variant="outline" mt={2}
            leftIcon={<Download size={14} />}>{t('startFresh.backup')}</Button>
        </Box>
        <FormControl isRequired>
          <FormLabel>{t('startFresh.phraseLabel')}</FormLabel>
          <Input ref={phraseRef} value={phrase} onChange={(e) => setPhrase(e.target.value)}
            placeholder={START_FRESH_PHRASE} autoComplete="off" autoCapitalize="characters" />
        </FormControl>
        {check.password ? (
          <FormControl isRequired>
            <FormLabel>{t('startFresh.passwordLabel')}</FormLabel>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('startFresh.passwordPlaceholder')} autoComplete="current-password" />
          </FormControl>
        ) : check.needsReauth && <ReauthNotice reason="startFresh" />}
      </Stack>
    </FormModal>
  )
}

function ScopeList({ title, lines }) {
  return (
    <Stack spacing={2} fontSize="sm" color="text.muted">
      <Text fontWeight="600" color="text.primary">{title}</Text>
      <UnorderedList spacing={1} pl={1}>
        {lines.map((line) => <ListItem key={line}>{line}</ListItem>)}
      </UnorderedList>
    </Stack>
  )
}
