import { Link as RouterLink } from 'react-router-dom'
import { IconButton, Stack } from '@chakra-ui/react'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '../../shared/ui/PageHeader.jsx'

// Shell for every Settings sub-page: the page header with a back button to
// the Settings list, then the page's cards.
export default function SettingsPage({ title, description, children }) {
  return (
    <Stack spacing={5}>
      <PageHeader eyebrow="Settings" title={title} description={description} leading={
        <IconButton as={RouterLink} to="/settings" aria-label="Back to settings"
          variant="ghost" size="sm" ml={-2} flexShrink={0} icon={<ArrowLeft size={18} />} />
      } />
      {children}
    </Stack>
  )
}
