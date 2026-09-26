import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Button, Link, ListItem, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Stack, Text, UnorderedList, useDisclosure, useToast,
} from '@chakra-ui/react'
import { Download, LogOut, Trash2 } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { DeleteAccountModal } from '../settings/DeleteAccount.jsx'
import { changesSince, formatVersion } from './legal.js'
import { downloadMyData } from './privacyData.js'
import { RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { Trans, useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import en from '../../locales/en/privacy.js'

// The items of one LEGAL_CHANGES entry, in the app's language: the
// dictionary's copy of that version (privacy:gate.changes), or legal.ts's
// English items for a version the dictionary doesn't have yet.
function changeItems(change, t) {
  const copy = en.gate.changes[change.version]
  return copy ? Object.keys(copy).map((k) => t(`gate.changes.${change.version}.${k}`)) : change.items
}

// Blocking prompt shown when the user hasn't accepted the Privacy Notice and
// Terms versions in force: a new account that signed up with Google, or
// anyone after a version change. Nothing of the app is mounted behind it
// (App.jsx). They can read both documents (the links open them full-page in
// place of the prompt, whose Back button returns here), accept, or — if they
// don't agree — download their data, delete their account, or sign out.
export default function LegalGate({ status, onAccept }) {
  const t = useT('privacy')
  const { user, signOut } = useAuth()
  const toast = useToast()
  const [declined, setDeclined] = useState(false)
  const { busy, run } = useAsyncSubmit()
  const exporting = useAsyncSubmit()
  const deleteModal = useDisclosure()

  // An account that never accepted anything gets a plain "please accept";
  // the "what changed" list is for people who accepted an earlier version.
  const firstTime = !status.privacy_accepted && !status.terms_accepted
  const changes = firstTime ? [] : changesSince(status)

  const accept = () => run(onAccept, { errorTitle: t('gate.acceptFailed') })
  const download = () => exporting.run(async () => {
    await downloadMyData()
    toast({ title: t('gate.downloaded'), status: 'success' })
  }, { errorTitle: t('gate.downloadFailed') })

  return (
    <>
      <Modal isOpen onClose={() => {}} isCentered closeOnOverlayClick={false} closeOnEsc={false}
        scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>
            {t(firstTime ? 'gate.firstTitle' : 'gate.updateTitle')}
          </ModalHeader>
          <ModalBody>
            <Stack spacing={4}>
              <Text color="text.muted" fontSize="sm">
                {t(firstTime ? 'gate.firstBody' : 'gate.updateBody')}
                {' '}{t('gate.version', { date: formatVersion(status.privacy_version) })}
              </Text>
              {changes.length > 0 && (
                <UnorderedList spacing={1.5} fontSize="sm" color="text.muted" pl={1}>
                  {changes.flatMap((c) => changeItems(c, t)).map((item) => <ListItem key={item}>{item}</ListItem>)}
                </UnorderedList>
              )}
              <Text fontSize="sm">
                <Trans t={t} k="gate.read" components={{
                  privacy: <Link as={RouterLink} to="/privacy" variant="inline" />,
                  terms: <Link as={RouterLink} to="/terms" variant="inline" />,
                }} />
              </Text>
              {declined && (
                <Stack spacing={2} borderWidth="1px" borderColor="border.default" borderRadius="xl" p={3}>
                  <Text fontSize="sm" color="text.muted">
                    {t(firstTime ? 'gate.firstDeclined' : 'gate.updateDeclined')}
                  </Text>
                  {!firstTime && (
                    <Button size="sm" variant="outline" leftIcon={<Download size={16} />}
                      isLoading={exporting.busy} loadingText={t('gate.gathering')} spinner={<RingSpinner />}
                      onClick={download}>{t('gate.download')}</Button>
                  )}
                  <Button size="sm" variant="outline" colorScheme="red" leftIcon={<Trash2 size={16} />}
                    onClick={deleteModal.onOpen}>{t('gate.delete')}</Button>
                  <Button size="sm" variant="ghost" leftIcon={<LogOut size={16} />} onClick={signOut}>
                    {t('gate.signOut')}
                  </Button>
                </Stack>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter gap={2}>
            {!declined && <Button variant="ghost" onClick={() => setDeclined(true)}>{t('gate.disagree')}</Button>}
            <Button onClick={accept} isLoading={busy}>{t('gate.accept')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <DeleteAccountModal user={user} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        signOut={signOut} />
    </>
  )
}
