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

// Blocking prompt shown when the user hasn't accepted the Privacy Notice and
// Terms versions in force: a new account that signed up with Google, or
// anyone after a version change. Nothing of the app is mounted behind it
// (App.jsx). They can read both documents (the links open them full-page in
// place of the prompt, whose Back button returns here), accept, or — if they
// don't agree — download their data, delete their account, or sign out.
export default function LegalGate({ status, onAccept }) {
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

  const accept = () => run(onAccept, { errorTitle: 'Couldn’t save your acceptance' })
  const download = () => exporting.run(async () => {
    await downloadMyData()
    toast({ title: 'Your data was downloaded', status: 'success' })
  }, { errorTitle: 'Couldn’t download your data' })

  return (
    <>
      <Modal isOpen onClose={() => {}} isCentered closeOnOverlayClick={false} closeOnEsc={false}
        scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>
            {firstTime ? 'Please accept to continue' : 'We’ve updated our terms'}
          </ModalHeader>
          <ModalBody>
            <Stack spacing={4}>
              <Text color="text.muted" fontSize="sm">
                {firstTime
                  ? 'To use Budgeer, please read and accept our Privacy Notice and Terms of Use.'
                  : 'Please review the changes to our Privacy Notice and Terms of Use to keep using Budgeer.'}
                {' '}Version {formatVersion(status.privacy_version)}.
              </Text>
              {changes.length > 0 && (
                <UnorderedList spacing={1.5} fontSize="sm" color="text.muted" pl={1}>
                  {changes.flatMap((c) => c.items).map((item) => <ListItem key={item}>{item}</ListItem>)}
                </UnorderedList>
              )}
              <Text fontSize="sm">
                Read the <Link as={RouterLink} to="/privacy" variant="inline">Privacy Notice</Link> and
                the <Link as={RouterLink} to="/terms" variant="inline">Terms of Use</Link>.
              </Text>
              {declined && (
                <Stack spacing={2} borderWidth="1px" borderColor="border.default" borderRadius="xl" p={3}>
                  <Text fontSize="sm" color="text.muted">
                    {firstTime
                      ? 'Without accepting, you can’t use Budgeer. You can delete the account you just created or sign out.'
                      : 'Without accepting, you can’t keep using Budgeer. You can still take your data with you or delete your account.'}
                  </Text>
                  {!firstTime && (
                    <Button size="sm" variant="outline" leftIcon={<Download size={16} />}
                      isLoading={exporting.busy} loadingText="Gathering your data…" spinner={<RingSpinner />}
                      onClick={download}>Download my data</Button>
                  )}
                  <Button size="sm" variant="outline" colorScheme="red" leftIcon={<Trash2 size={16} />}
                    onClick={deleteModal.onOpen}>Delete my account</Button>
                  <Button size="sm" variant="ghost" leftIcon={<LogOut size={16} />} onClick={signOut}>
                    Sign out
                  </Button>
                </Stack>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter gap={2}>
            {!declined && <Button variant="ghost" onClick={() => setDeclined(true)}>I don’t agree</Button>}
            <Button onClick={accept} isLoading={busy}>Accept and continue</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <DeleteAccountModal user={user} isOpen={deleteModal.isOpen} onClose={deleteModal.onClose}
        signOut={signOut} />
    </>
  )
}
