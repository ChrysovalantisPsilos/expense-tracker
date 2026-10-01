import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { FormControl, FormLabel, HStack, Input, Stack, Text, useToast } from '@chakra-ui/react'
import FormPage, { PageForm } from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import MoneyInput from '../../shared/ui/MoneyInput.jsx'
import OptionalDate from '../../shared/ui/OptionalDate.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useGoals, saveGoal } from './savings.js'
import { goalDraft, goalToSave } from './savingsMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A savings goal's page:
//   /savings/goals/new   a new goal
//   /savings/goals/:id   an existing one (Savings passes it in router state;
//                        a reload finds it in the list)
// Saving goes back to wherever the user came from, else Savings. (The old
// /insights/goals/… addresses redirect here: App.jsx.)
export default function GoalPage() {
  const { id } = useParams()
  const location = useLocation()
  const t = useT('savings')
  const { baseCurrency, profile, loading: profileLoading } = useProfile()
  const { goals, loading, error, reload } = useGoals()
  const passed = location.state?.goal
  const goal = id ? goals.find((g) => g.id === id) ?? (passed?.id === id ? passed : null) : null

  let body
  if (id && !goal && error) body = <Panel><QueryError error={error} onRetry={reload} what={t('goal.what')} /></Panel>
  else if ((id && !goal && loading) || (!profile && profileLoading)) body = <RingLoader />
  else if (id && !goal) body = <Panel><Text color="text.muted">{t('goal.gone')}</Text></Panel>
  else body = <GoalForm key={goal?.id ?? 'new'} goal={goal} baseCurrency={baseCurrency} />

  return (
    <FormPage eyebrow={t('goal.eyebrow')} title={t(id ? 'goal.titleEdit' : 'goal.titleNew')} fallback="/savings">
      {body}
    </FormPage>
  )
}

function GoalForm({ goal, baseCurrency }) {
  const toast = useToast()
  const t = useT('savings')
  const back = useGoBack('/savings')
  const isEdit = !!goal
  const [start] = useState(() => goalDraft(goal, baseCurrency))
  const [name, setName] = useState(start.name)
  const [target, setTarget] = useState(start.target)
  const [saved, setSaved] = useState(start.saved)
  const { currency } = start
  const [targetDate, setTargetDate] = useState(start.targetDate)
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    const ready = goalToSave({ name, target, saved, currency, targetDate }, goal?.id)
    if (ready.error) return toast({ title: ready.error, status: 'warning' })
    await run(async () => {
      await saveGoal(ready.goal)
      back()
    })
  }

  return (
    <PageForm onSubmit={submit} busy={busy} submitLabel={t(isEdit ? 'goal.save' : 'goal.add')}>
      <Stack spacing={4}>
        <FormControl isRequired>
          <FormLabel>{t('goal.name')}</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('goal.nameHint')} />
        </FormControl>
        <HStack align="start">
          <FormControl isRequired>
            <FormLabel>{t('goal.target', { currency })}</FormLabel>
            <MoneyInput currency={currency} value={target} onChange={setTarget} placeholder="0" />
          </FormControl>
          <FormControl>
            <FormLabel>{t('goal.saved')}</FormLabel>
            <MoneyInput currency={currency} value={saved} onChange={setSaved} placeholder="0" />
          </FormControl>
        </HStack>
        <FormControl>
          <OptionalDate label={t('goal.targetDate')} value={targetDate} onChange={setTargetDate} />
        </FormControl>
      </Stack>
    </PageForm>
  )
}
