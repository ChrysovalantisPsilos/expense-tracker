import { Text } from '@chakra-ui/react'
import { FlaskConical } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// On the shared demo account (profiles.is_demo, 0090): the Settings list's
// note, and what stands in for a card whose controls are switched off there.
// `children` says what is off; the reset note follows it.
export default function DemoNotice({ children }) {
  const t = useT('settings')
  return (
    <Panel title={t('demo.title')} icon={FlaskConical}>
      {children && <Text fontSize="sm" mb={2}>{children}</Text>}
      <Text fontSize="sm" color="text.muted">{t('demo.reset')}</Text>
    </Panel>
  )
}
