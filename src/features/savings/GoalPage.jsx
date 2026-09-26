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
import { minorToInput, toMinor } from '../../shared/lib/currency.js'
import { useGoals, saveGoal } from './savings.js'
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
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? minorToInput(goal.target_minor, goal.currency) : '')
  const [saved, setSaved] = useState(goal ? minorToInput(goal.saved_minor, goal.currency) : '0')
  const [currency] = useState(goal?.currency ?? baseCurrency)
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '')
  const { busy, run } = useAsyncSubmit()

  async function submit() {
    if (!name.trim()) return toast({ title: t('goal.nameIt'), status: 'warning' })
    if (!target || Number(target) <= 0) return toast({ title: t('goal.setTarget'), status: 'warning' })
    await run(async () => {
      await saveGoal({
        id: goal?.id, name: name.trim(),
        target_minor: toMinor(target, currency), saved_minor: toMinor(saved || '0', currency),
        currency, target_date: targetDate || null,
      })
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
