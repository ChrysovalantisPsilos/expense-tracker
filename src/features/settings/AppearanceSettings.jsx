import { SimpleGrid, Button, Text } from '@chakra-ui/react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useAppearance } from '../../shared/lib/appearance.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsPage from './SettingsPage.jsx'

const APPEARANCE_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export default function AppearanceSettings() {
  const { pref, setPref } = useAppearance()
  return (
    <SettingsPage title="Appearance"
      description="Choose your theme. “System” follows your device and switches automatically.">
      <Panel>
        <SimpleGrid columns={3} spacing={{ base: 2, md: 3 }}>
          {APPEARANCE_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = pref === value
            return (
              <Button key={value} onClick={() => setPref(value)} variant="outline"
                aria-pressed={active}
                flexDirection="column" h="auto" py={5} gap={2}
                borderWidth="2px"
                borderColor={active ? 'brand.500' : 'border.default'}
                color={active ? 'accent.fg' : 'text.muted'}
                bg={active ? 'bg.subtle' : 'transparent'}
                _hover={{ bg: 'bg.subtle' }}>
                <Icon size={24} />
                <Text fontSize="sm" fontWeight="600">{label}</Text>
              </Button>
            )
          })}
        </SimpleGrid>
      </Panel>
    </SettingsPage>
  )
}
