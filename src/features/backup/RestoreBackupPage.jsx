import { useEffect, useRef, useState } from 'react'
import {
  Stack, Text, Button, FormControl, FormLabel, FormErrorMessage, Input,
  Progress, Box, Flex, HStack, useToast,
} from '@chakra-ui/react'
import { Upload, Check, Info, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { EVENTS } from '../../shared/lib/keys.js'
import { unsavedFormAttr } from '../../shared/lib/autoUpdate.js'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { BalanceGrid, BalanceTile } from '../../shared/ui/kit/Balances.jsx'
import { readBackup, unlockBackup, backupContents, restoreSummary } from './backupMath.js'
import { restoreBackup, restoreCurrencyPlan } from './backup.js'
import Note from './Note.jsx'
import { UserError, userMessage } from '../../shared/lib/errors.js'
import { RingMark, RingSpinner } from '../../shared/ui/RingLoader.jsx'
import { intlLocale } from '../../shared/lib/i18n/i18n.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Hard ceiling on what we'll read into memory; real backups are far smaller.
const MAX_FILE_BYTES = 50 * 1024 * 1024

// /settings/data/restore — pick a file → (password) → review → progress →
// summary, one step at a time on this page. A restore only ever adds:
// nothing is deleted or overwritten. From a picked file until the summary,
// the page counts as unsaved work (no automatic update reload), and Back is
// held while the restore runs.
export default function RestoreBackupPage() {
  const t = useT('backup')
  const [flow, setFlow] = useState({ step: 'choose' }) // { step, envelope?, backup?, error?, tally? }
  const running = flow.step === 'running'
  const choose = () => setFlow({ step: 'choose' })

  return (
    <FormPage eyebrow={t('settings:rows.data.label')} title={t(`restore.steps.${flow.step}`)} fallback="/settings/data"
      backDisabled={running}>
      <Stack spacing={5} {...unsavedFormAttr(['password', 'review', 'running'].includes(flow.step))}>
        {flow.step === 'choose' && <ChooseStep setFlow={setFlow} />}
        {flow.step === 'error' && <ErrorStep message={flow.error} onRetry={choose} />}
        {flow.step === 'password' && <PasswordStep envelope={flow.envelope} setFlow={setFlow} />}
        {(flow.step === 'review' || running) && (
          <ReviewStep backup={flow.backup} setFlow={setFlow} running={running} />
        )}
        {flow.step === 'done' && <DoneStep tally={flow.tally} />}
      </Stack>
    </FormPage>
  )
}

function ChooseStep({ setFlow }) {
  const t = useT('backup')
  const input = useRef(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) throw new UserError(t('errors.tooLarge'))
      const read = readBackup(await file.text())
      setFlow(read.encrypted ? { step: 'password', envelope: read.envelope } : { step: 'review', backup: read.backup })
    } catch (err) {
      console.error('[backup] file not read:', err)
      setFlow({ step: 'error', error: userMessage(err, t('errors.unreadable')) })
    }
  }

  return (
    <Panel>
      <Text fontSize="sm" color="text.muted" mb={4}>{t('restore.chooseLead')}</Text>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={onFile} />
      <Button w={{ base: 'full', sm: 'auto' }} leftIcon={<Upload size={16} />} onClick={() => input.current?.click()}>
        {t('restore.chooseFile')}
      </Button>
    </Panel>
  )
}

function ErrorStep({ message, onRetry }) {
  const t = useT('backup')
  return (
    <>
      <Note icon={ShieldAlert} tone="warning">{message}</Note>
      <Button onClick={onRetry}>{t('restore.chooseAnother')}</Button>
    </>
  )
}

function PasswordStep({ envelope, setFlow }) {
  const t = useT('backup')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      setFlow({ step: 'review', backup: await unlockBackup(envelope, password) })
    } catch (err) {
      console.error('[backup] unlock failed:', err)
      setError(userMessage(err, t('errors.wrongPassword')))
      setBusy(false)
    }
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t('restore.unlock')}
      submitProps={{ loadingText: t('restore.unlocking'), spinner: <RingSpinner />, isDisabled: !password }}>
      <Stack spacing={4}>
        <Text fontSize="sm" color="text.muted">{t('restore.locked')}</Text>
        <FormControl isInvalid={!!error}>
          <FormLabel>{t('auth:password.label')}</FormLabel>
          <Input type="password" value={password} autoComplete="off"
            onChange={(e) => { setPassword(e.target.value); setError(null) }} />
          <FormErrorMessage>{error}</FormErrorMessage>
        </FormControl>
      </Stack>
    </PageForm>
  )
}

// What the backup holds, in this order (labels: backup:restore.contents.<id>).
const CONTENT_ROWS = ['expenses', 'income', 'categories', 'rules', 'budgets', 'recurring', 'accounts', 'goals', 'groups']

function ReviewStep({ backup, setFlow, running }) {
  const t = useT('backup')
  const { user } = useAuth()
  const toast = useToast()
  const [progress, setProgress] = useState(() => ({ label: t('restore.progressSteps.starting'), done: 0, total: 0 }))
  const contents = backupContents(backup)
  const made = backup.exportedAt ? new Date(backup.exportedAt) : null
  const [currency, setCurrency] = useState(null) // { change, from, to }

  useEffect(() => {
    let live = true
    restoreCurrencyPlan(user.id, backup)
      .then((plan) => { if (live) setCurrency(plan) })
      .catch((err) => console.error('[backup] currency check failed:', err))
    return () => { live = false }
  }, [user.id, backup])

  async function start() {
    setFlow((f) => ({ ...f, step: 'running' }))
    try {
      const tally = await restoreBackup(user, backup, setProgress)
      // Nav bar / settings pick up a restored name or currency at once.
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
      setFlow({ step: 'done', tally })
    } catch (err) {
      console.error('[backup] restore stopped:', err)
      toast({ title: t('restore.stopped'), status: 'error',
        description: t('restore.stoppedBody', { error: userMessage(err) }) })
      setFlow((f) => ({ ...f, step: 'review' }))
    }
  }

  const pct = progress.total ? (progress.done / progress.total) * 100 : null
  return (
    <>
      <Panel>
        <Stack spacing={4}>
          {running && (
            <Box aria-live="polite">
              <Flex justify="space-between" fontSize="sm" mb={1.5} gap={2}>
                <HStack spacing={2.5} minW={0}>
                  <RingMark size={20} />
                  <Text minW={0} overflowWrap="anywhere">{progress.label}…</Text>
                </HStack>
                {progress.total > 0 && (
                  <Text color="text.muted" flexShrink={0}>{progress.done} / {progress.total}</Text>
                )}
              </Flex>
              <Progress size="sm" value={pct ?? undefined} isIndeterminate={pct === null}
                aria-label={t('restore.progress')} />
            </Box>
          )}
          {made && !isNaN(made) && (
            <Text fontSize="sm" color="text.muted">
              {t('restore.made', { date: made.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </Text>
          )}
          <CurrencyLine plan={currency} />
          <BalanceGrid columns={{ base: 2, sm: 3 }}>
            {CONTENT_ROWS.map((k) => (
              <BalanceTile key={k} label={t(`restore.contents.${k}`)} value={contents[k]}
                tone={contents[k] ? 'default' : 'muted'} />
            ))}
          </BalanceGrid>
          {contents.groupShares > 0 && (
            <Note icon={Info}>{t('restore.groupShares', { shares: contents.groupShares })}</Note>
          )}
          <Note icon={Info}>{t('restore.onlyMissing')}</Note>
        </Stack>
      </Panel>
      <Button leftIcon={<Upload size={16} />} onClick={start} isLoading={running}
        loadingText={t('restore.restoring')} spinner={<RingSpinner />}>
        {t('restore.restore')}
      </Button>
    </>
  )
}

// One quiet line on what happens to the main currency (backupMath.js
// currencyChange); nothing when the backup's matches the account's.
function CurrencyLine({ plan }) {
  const t = useT('backup')
  if (!plan?.change) return null
  const { change, from, to } = plan
  return (
    <Text fontSize="sm" color="text.muted">
      {t(change === 'adopt' ? 'restore.currencyAdopt' : 'restore.currencyConvert', { from, to })}
    </Text>
  )
}

function DoneStep({ tally }) {
  const t = useT('backup')
  const back = useGoBack('/settings/data')
  const { added, skipped, kept } = restoreSummary(tally)
  return (
    <>
      <Panel>
        <Stack spacing={3} align="center" textAlign="center" py={2}>
          <IconTile icon={Check} size={56} radius="xl" tone="positive" />
          <Text fontWeight="600">{added}</Text>
          {skipped && <Text fontSize="sm" color="text.muted">{skipped}</Text>}
          {kept && <Text fontSize="sm" color="text.muted">{kept}</Text>}
        </Stack>
      </Panel>
      <Button onClick={back}>{t('restore.done')}</Button>
    </>
  )
}
