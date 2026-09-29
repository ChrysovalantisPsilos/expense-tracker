import { Stack } from '@chakra-ui/react'
import PageHeader from '../../shared/ui/PageHeader.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Shell for every Settings sub-page: the page header with a back button —
// to wherever the user came from (e.g. the Meal vouchers page's settings
// button), or to the Settings list when the page was opened directly — then
// the page's cards.
export default function SettingsPage({ title, description, children }) {
  const t = useT('settings')
  return (
    <Stack spacing={5}>
      <PageHeader eyebrow={t('title')} title={title} description={description}
        leading={<BackButton fallback="/settings" />} />
      {children}
    </Stack>
  )
}
