import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { Button, Stack, Text } from '@chakra-ui/react'
import FormPage from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useRecurring } from './recurring.js'
import RecurringForm from './RecurringForm.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A recurring rule's page, /recurring/:id: the list passes the rule in router
// state; a reload or a shared link finds it in the list. There's no page for
// a new rule: one is added from Add with Repeat on (the old /recurring/new
// redirects there, addLinks.recurringNewLink). Saving goes back to wherever
// the user came from, else to Recurring.
export default function RecurringPage() {
  const t = useT('recurring')
  const { id } = useParams()
  const location = useLocation()
  const back = useGoBack('/recurring')
  const { baseCurrency } = useProfile()
  const { rules, loading, error, reload } = useRecurring()

  const passed = location.state?.rule
  const rule = rules.find((r) => r.id === id) ?? (passed?.id === id ? passed : null)

  let body
  if (!rule && error) body = <Panel><QueryError error={error} onRetry={reload} what={t('page.what')} /></Panel>
  else if (!rule && loading) body = <RingLoader />
  else if (!rule) {
    body = (
      <Panel>
        <Stack spacing={3} align="start">
          <Text color="text.muted">{t('page.gone')}</Text>
          <Button as={RouterLink} to="/recurring" size="sm">{t('page.goToList')}</Button>
        </Stack>
      </Panel>
    )
  } else {
    body = (
      <RecurringForm key={rule.id} rule={rule} baseCurrency={baseCurrency} onSaved={back} />
    )
  }

  return (
    <FormPage eyebrow={t('list.title')} fallback="/recurring" title={t('page.editTitle')}>
      {body}
    </FormPage>
  )
}
