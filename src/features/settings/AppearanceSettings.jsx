import { SimpleGrid, Button, Text } from '@chakra-ui/react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useAppearance } from '../../shared/lib/appearance.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import SettingsSubPage from '../../shared/ui/SettingsSubPage.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// `value` is also the option's key under appearance.* in the settings namespace.
const APPEARANCE_OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
]

export default function AppearanceSettings() {
  const t = useT('settings')
  const { pref, setPref } = useAppearance()
  return (
    <SettingsSubPage title={t('appearance.title')} description={t('appearance.description')}>
      <Panel>
        <SimpleGrid columns={3} spacing={{ base: 2, md: 3 }}>
          {APPEARANCE_OPTIONS.map(({ value, icon: Icon }) => {
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
                <Text fontSize="sm" fontWeight="600">{t(`appearance.${value}`)}</Text>
              </Button>
            )
          })}
        </SimpleGrid>
      </Panel>
    </SettingsSubPage>
  )
}
