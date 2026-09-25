import { useState } from 'react'
import { useToast, Stack, HStack, Text, Select, Divider, FormControl, FormLabel } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { updateProfile } from '../../shared/lib/profile.js'
import { EVENTS } from '../../shared/lib/keys.js'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'
import PrefRow from './PrefRow.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useCategories } from '../transactions/useData.js'
import { SALARY_SHIFT_DAYS, salaryShiftPatch } from './spendingPrefs.js'

// How monthly spending is counted. Two synced preferences:
//   * profiles.yearly_separate (0068). Off (the default) spreads a yearly
//     subscription over the months it covers; on keeps those payments out of
//     every monthly figure — Home, Insights, budgets and the server's budget
//     alerts — (Home’s Subscriptions card lists them under Yearly either way).
//   * the salary shift (0081: salary_shift_from_day, salary_category_id). On,
//     income in the chosen category paid from day D to the month's end counts
//     toward the next month's totals (lists keep the real date).
export default function SpendingSettings() {
  const { user } = useAuth()
  const { profile, separateYearly } = useProfile()
  const toast = useToast()
  // The value being saved, shown until the profile (refetched on
  // profileUpdated) catches up — then the live value takes over again.
  const [pending, setPending] = useState(null)
  if (pending !== null && pending === separateYearly) setPending(null)
  const separate = pending ?? separateYearly

  async function save(patch, undo) {
    try {
      await updateProfile(user.id, patch)
      window.dispatchEvent(new Event(EVENTS.profileUpdated))
    } catch (err) {
      undo()
      console.error('[settings] spending setting not saved:', err)
      toast({ title: 'Couldn’t save', description: userMessage(err), status: 'error' })
    }
  }

  function onChange(e) {
    const next = !e.target.checked // the switch reads "count them in monthly"
    setPending(next)
    save({ yearly_separate: next }, () => setPending(null))
  }

  return (
    <SettingsPage title="Monthly spending">
      <Panel>
        {!profile ? (
          <RingLoader compact />
        ) : (
          <Stack spacing={4}>
            <PrefRow id="pref-yearly" label="Count yearly subscriptions in monthly spending"
              hint="On: a yearly payment is spread over the months it covers. Off: it stays out of monthly totals and budgets (Home's Subscriptions card still lists it)."
              isChecked={!separate} onChange={onChange} />
            <Divider />
            <SalaryShiftPref profile={profile} save={save} />
          </Stack>
        )}
      </Panel>
    </SettingsPage>
  )
}

// "Count salary paid late in the month toward the next month": the switch,
// then (while on) the day it starts and which income category is the salary.
function SalaryShiftPref({ profile, save }) {
  const { categories, loading } = useCategories('income')
  // Fields being saved, shown over the profile until it catches up.
  const [pending, setPending] = useState(null)
  const live = {
    salary_shift_from_day: profile.salary_shift_from_day ?? null,
    salary_category_id: profile.salary_category_id ?? null,
  }
  if (pending && Object.entries(pending).every(([k, v]) => live[k] === v)) setPending(null)
  const shown = { ...live, ...pending }
  const on = shown.salary_shift_from_day != null
  const noIncome = !loading && categories.length === 0

  function change(patch) {
    setPending((p) => ({ ...p, ...patch }))
    save(patch, () => setPending(null))
  }

  return (
    <Stack spacing={3}>
      <PrefRow id="pref-salary-shift" label="Count salary paid late in the month toward the next month"
        hint={noIncome && !on
          ? 'Add an income category (like Salary) first.'
          : 'For a salary paid near the month’s end for the month after: it counts in the next month’s totals. Lists keep the real payment date.'}
        isChecked={on} isDisabled={noIncome && !on}
        onChange={(e) => change(salaryShiftPatch(e.target.checked, {
          fromDay: shown.salary_shift_from_day, categoryId: shown.salary_category_id, categories,
        }))} />
      {on && (
        <Stack spacing={3}>
          <FormControl>
            <HStack spacing={2} wrap="wrap">
              <FormLabel htmlFor="pref-salary-day" m={0} fontSize="sm" fontWeight="500">From day</FormLabel>
              <Select id="pref-salary-day" size="sm" w="76px" borderRadius="lg"
                value={shown.salary_shift_from_day}
                onChange={(e) => change({ salary_shift_from_day: Number(e.target.value) })}>
                {SALARY_SHIFT_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Text fontSize="sm" color="text.muted">to the month’s end</Text>
            </HStack>
            {shown.salary_shift_from_day > 28 && (
              <Text fontSize="xs" color="text.muted" mt={1}>In shorter months, from their last day.</Text>
            )}
          </FormControl>
          <FormControl>
            <FormLabel htmlFor="pref-salary-cat" fontSize="sm" fontWeight="500" mb={1}>Salary category</FormLabel>
            <Select id="pref-salary-cat" size="sm" borderRadius="lg" maxW="280px"
              placeholder={shown.salary_category_id ? undefined : 'Choose a category'}
              value={shown.salary_category_id ?? ''}
              onChange={(e) => e.target.value && change({ salary_category_id: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormControl>
        </Stack>
      )}
    </Stack>
  )
}
