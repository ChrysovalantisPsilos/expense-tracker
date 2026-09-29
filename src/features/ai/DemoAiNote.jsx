import { HStack, Text } from '@chakra-ui/react'
import { FlaskConical } from 'lucide-react'
import { useProfile } from '../../shared/lib/ProfileProvider.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Under the AI typing boxes (Type it on Add, Type a what-if in Plan), on the
// shared demo login only (0106): the helpers are on there, and what a visitor
// types goes to Anthropic like anyone's. Settings → AI helpers says the same
// in the demo notice.
export default function DemoAiNote(props) {
  const t = useT('ai')
  const { isDemo } = useProfile()
  if (!isDemo) return null
  return (
    <HStack align="start" spacing={2} fontSize="sm" color="text.muted" {...props}>
      <FlaskConical size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
      <Text>{t('demoNote')}</Text>
    </HStack>
  )
}
