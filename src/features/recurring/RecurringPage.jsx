import { Link as RouterLink, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Button, Stack, Text } from '@chakra-ui/react'
import FormPage from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import useGoBack from '../../shared/ui/useGoBack.js'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useRecurring } from './recurring.js'
import RecurringForm from './RecurringForm.jsx'

// A recurring rule's page:
//   /recurring/new?kind=expense|income   a new rule
//   /recurring/:id                       an existing one (the list passes the
//                                        rule in router state; a reload or a
//                                        shared link finds it in the list)
// Saving goes back to wherever the user came from, else to Recurring.
export default function RecurringPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const back = useGoBack('/recurring')
  const { baseCurrency, profile, loading: profileLoading } = useProfile()
  const { rules, loading, error, reload } = useRecurring()

  const passed = location.state?.rule
  const rule = id ? rules.find((r) => r.id === id) ?? (passed?.id === id ? passed : null) : null
  const kind = params.get('kind') === 'income' ? 'income' : 'expense'

  let body
  if (id && !rule && error) body = <Panel><QueryError error={error} onRetry={reload} what="this recurring entry" /></Panel>
  // A new rule starts in the base currency, which the form reads once.
  else if ((id && !rule && loading) || (!profile && profileLoading)) body = <RingLoader />
  else if (id && !rule) {
    body = (
      <Panel>
        <Stack spacing={3} align="start">
          <Text color="text.muted">This recurring entry doesn’t exist any more.</Text>
          <Button as={RouterLink} to="/recurring" size="sm">Go to Recurring</Button>
        </Stack>
      </Panel>
    )
  } else {
    body = (
      <RecurringForm key={rule?.id ?? `new-${kind}`} rule={rule} kind={kind}
        baseCurrency={baseCurrency} onSaved={back} />
    )
  }

  return (
    <FormPage eyebrow="Recurring" fallback="/recurring"
      title={id ? 'Edit recurring entry' : 'New recurring entry'}>
      {body}
    </FormPage>
  )
}
