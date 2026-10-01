import { useParams } from 'react-router-dom'
import { Text } from '@chakra-ui/react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import FormPage from '../../shared/ui/FormPage.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import QueryError from '../../shared/ui/QueryError.jsx'
import RingLoader from '../../shared/ui/RingLoader.jsx'
import { useGroup } from './groups.js'
import { groupViewer } from './groupFormat.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The shell of a group's own pages (settle up, add or edit an expense,
// comments, members, edit group): loads the group live (useGroup), heads the
// page with the group's name over `title`, and a back arrow to wherever the
// user came from, else the group. `children(ctx)` renders the body once the
// group is in: ctx is useGroup's data plus `myMember` (null when the viewer
// isn't a member), `isOwner`, `groupPath` and `reload`. `description` may also be a
// function of ctx (shown once the group is in).
export default function GroupFormPage({ title, description, children }) {
  const { id } = useParams()
  const { user } = useAuth()
  const t = useT('groups')
  const { data, loading, error, reload } = useGroup(id)
  const groupPath = `/groups/${id}`

  const ctx = !error && !loading && data?.group ? {
    ...data,
    ...groupViewer(data.group, data.members, user.id),
    groupPath,
    reload,
  } : null

  let body
  if (error) body = <Panel><QueryError error={error} onRetry={reload} what={t('whatGroup')} py={8} /></Panel>
  else if (loading) body = <RingLoader />
  else if (!ctx) body = <Panel><Text color="text.muted">{t('notFound')}</Text></Panel>
  else body = children(ctx)

  return (
    <FormPage eyebrow={ctx?.group.name ?? t('title')} title={title} fallback={groupPath}
      description={typeof description === 'function' ? ctx && description(ctx) : description}>
      {body}
    </FormPage>
  )
}
