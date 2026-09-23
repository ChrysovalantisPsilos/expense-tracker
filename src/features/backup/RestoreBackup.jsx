import { useRef, useState } from 'react'
import {
  Stack, Text, Button, FormControl, FormLabel, FormErrorMessage, Input,
  Progress, Box, Flex, useToast, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton,
} from '@chakra-ui/react'
import { Upload, Check, Info, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { EVENTS } from '../../shared/lib/keys.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { readBackup, unlockBackup, backupContents, restoreSummary } from './backupMath.js'
import { restoreBackup } from './backup.js'
import Note from './Note.jsx'

// Hard ceiling on what we'll read into memory; real backups are far smaller.
const MAX_FILE_BYTES = 50 * 1024 * 1024

// "Restore from backup": pick a file → (password) → review → progress → summary.
// A restore only ever adds: nothing is deleted or overwritten.
export default function RestoreBackup() {
  const input = useRef(null)
  const [flow, setFlow] = useState(null) // { step, envelope?, backup?, error? }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('This file is too large to be a Budgeer backup.')
      const read = readBackup(await file.text())
      setFlow(read.encrypted ? { step: 'password', envelope: read.envelope } : { step: 'review', backup: read.backup })
    } catch (err) {
      setFlow({ step: 'error', error: err.message })
    }
  }

  return (
    <Panel title="Restore from backup" icon={Upload}>
      <Text fontSize="sm" color="text.muted" mb={4}>
        Adds what’s missing from a Budgeer backup file to this account. Nothing
        is deleted or overwritten, and entries you already have are skipped — so
        it’s safe to run more than once.
      </Text>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={onFile} />
      <Button variant="outline" leftIcon={<Upload size={16} />} onClick={() => input.current?.click()}>
        Choose backup file
      </Button>
      {flow && <RestoreDialog flow={flow} setFlow={setFlow} onClose={() => setFlow(null)} />}
    </Panel>
  )
}

function RestoreDialog({ flow, setFlow, onClose }) {
  const busy = flow.step === 'running'
  // A locked backup opens straight on its password field.
  const passwordRef = useRef(null)
  const titles = {
    error: 'Can’t restore this file', password: 'Enter the backup’s password',
    review: 'Restore this backup?', running: 'Restoring…', done: 'Restore complete',
  }
  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} isCentered scrollBehavior="inside"
      initialFocusRef={flow.step === 'password' ? passwordRef : undefined}>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader pr={12}>{titles[flow.step]}</ModalHeader>
        {!busy && <ModalCloseButton />}
        {flow.step === 'error' && <ErrorStep message={flow.error} onClose={onClose} />}
        {flow.step === 'password' && <PasswordStep envelope={flow.envelope} setFlow={setFlow} onClose={onClose}
          inputRef={passwordRef} />}
        {(flow.step === 'review' || flow.step === 'running') && (
          <ReviewStep backup={flow.backup} setFlow={setFlow} onClose={onClose} running={busy} />
        )}
        {flow.step === 'done' && <DoneStep tally={flow.tally} onClose={onClose} />}
      </ModalContent>
    </Modal>
  )
}

function ErrorStep({ message, onClose }) {
  return (
    <>
      <ModalBody>
        <Note icon={ShieldAlert} tone="warning">{message}</Note>
      </ModalBody>
      <ModalFooter><Button onClick={onClose}>OK</Button></ModalFooter>
    </>
  )
}

function PasswordStep({ envelope, setFlow, onClose, inputRef }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      setFlow({ step: 'review', backup: await unlockBackup(envelope, password) })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalBody>
        <Stack spacing={4}>
          <Text fontSize="sm" color="text.muted">
            This backup is password-protected. It’s unlocked on this device; the
            password isn’t sent anywhere.
          </Text>
          <FormControl isInvalid={!!error}>
            <FormLabel>Password</FormLabel>
            <Input ref={inputRef} type="password" value={password} autoComplete="off"
              onChange={(e) => { setPassword(e.target.value); setError(null) }} />
            <FormErrorMessage>{error}</FormErrorMessage>
          </FormControl>
        </Stack>
      </ModalBody>
      <ModalFooter gap={2}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" isLoading={busy} loadingText="Unlocking" isDisabled={!password}>Unlock</Button>
      </ModalFooter>
    </form>
  )
}

const CONTENT_ROWS = [
  ['expenses', 'Expenses'], ['income', 'Income'], ['categories', 'Categories'],
  ['rules', 'Auto-category rules'], ['budgets', 'Budgets'], ['recurring', 'Recurring'],
  ['accounts', 'Accounts'], ['goals', 'Savings goals'], ['groups', 'Groups (record only)'],
]

function ReviewStep({ backup, setFlow, onClose, running }) {
  const { user } = useAuth()
  const toast = useToast()
  const [progress, setProgress] = useState({ label: 'Starting', done: 0, total: 0 })
  const contents = backupContents(backup)
  const made = backup.exportedAt ? new Date(backup.exportedAt) : null

  async function start() {
    setFlow((f) => ({ ...f, step: 'running' }))
    try {
      const tally = await restoreBackup(user, backup, setProgress)
      // Nav bar / settings pick up a restored name or currency at once.
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
      setFlow({ step: 'done', tally })
    } catch (err) {
      toast({ title: 'The restore stopped', status: 'error',
        description: `${err.message} What was added so far stays; running the restore again picks up the rest.` })
      setFlow((f) => ({ ...f, step: 'review' }))
    }
  }

  const pct = progress.total ? (progress.done / progress.total) * 100 : null
  return (
    <>
      <ModalBody>
        <Stack spacing={4}>
          {running && (
            <Box aria-live="polite">
              <Flex justify="space-between" fontSize="sm" mb={1.5} gap={2}>
                <Text noOfLines={1}>{progress.label}…</Text>
                {progress.total > 0 && (
                  <Text color="text.muted" flexShrink={0}>{progress.done} / {progress.total}</Text>
                )}
              </Flex>
              <Progress size="sm" value={pct ?? undefined} isIndeterminate={pct === null} />
            </Box>
          )}
          {made && !isNaN(made) && (
            <Text fontSize="sm" color="text.muted">
              Backup made {made.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.
            </Text>
          )}
          <BalanceGrid columns={{ base: 2, sm: 3 }}>
            {CONTENT_ROWS.map(([k, label]) => (
              <BalanceTile key={k} label={label} value={contents[k]}
                tone={contents[k] ? 'default' : 'muted'} />
            ))}
          </BalanceGrid>
          {contents.groupShares > 0 && (
            <Note icon={Info}>
              {contents.groupShares} of the expenses are your shares of group
              expenses. They come back as personal expenses, with the group’s
              name in the notes. The groups themselves aren’t restored.
            </Note>
          )}
          <Note icon={Info}>
            Only what’s missing is added. Your name, currency, notification
            and payment settings are kept; the backup’s fill in only what’s
            empty or still at its default.
          </Note>
        </Stack>
      </ModalBody>
      <ModalFooter gap={2}>
        <Button variant="ghost" onClick={onClose} isDisabled={running}>Cancel</Button>
        <Button leftIcon={<Upload size={16} />} onClick={start} isLoading={running}
          loadingText="Restoring">
          Restore
        </Button>
      </ModalFooter>
    </>
  )
}

function DoneStep({ tally, onClose }) {
  const { added, skipped, kept } = restoreSummary(tally)
  return (
    <>
      <ModalBody>
        <Stack spacing={3} align="center" textAlign="center" py={2}>
          <IconTile icon={Check} size={56} radius="xl" tone="positive" />
          <Text fontWeight="600">{added}</Text>
          {skipped && <Text fontSize="sm" color="text.muted">{skipped}</Text>}
          {kept && <Text fontSize="sm" color="text.muted">{kept}</Text>}
        </Stack>
      </ModalBody>
      <ModalFooter><Button onClick={onClose}>Done</Button></ModalFooter>
    </>
  )
}
