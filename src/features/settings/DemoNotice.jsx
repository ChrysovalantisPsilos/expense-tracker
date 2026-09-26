import { Text } from '@chakra-ui/react'
import { FlaskConical } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'

const RESET_NOTE = 'Anyone with the demo login uses this account, so everything goes back to the sample data every night (03:00 UTC).'

// On the shared demo account (profiles.is_demo, 0090): the Settings list's
// note, and what stands in for a card whose controls are switched off there.
// `children` says what is off; the reset note follows it.
export default function DemoNotice({ children }) {
  return (
    <Panel title="Demo account: resets every night" icon={FlaskConical}>
      {children && <Text fontSize="sm" mb={2}>{children}</Text>}
      <Text fontSize="sm" color="text.muted">{RESET_NOTE}</Text>
    </Panel>
  )
}
