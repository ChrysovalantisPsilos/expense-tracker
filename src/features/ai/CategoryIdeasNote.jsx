import { Box, HStack, Text } from '@chakra-ui/react'
import { CircleAlert, Sparkle } from 'lucide-react'
import { BusyNote } from '../../shared/ui/RingLoader.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Import's line about the category ideas (ai.useCategoryIdeas): finding them,
// how many merchants got one, or that none came this time.
export default function CategoryIdeasNote({ status, count, total, ...props }) {
  const t = useT('ai')
  if (status === 'working') return <BusyNote {...props}>{t('import.working')}</BusyNote>
  if (status === 'failed' || (status === 'done' && count === 0)) {
    return (
      <HStack align="start" spacing={2} fontSize="sm" color="text.muted" {...props}>
        <Box pt="2px" flexShrink={0}><CircleAlert size={16} aria-hidden /></Box>
        <Text>{t('import.none')}</Text>
      </HStack>
    )
  }
  if (status !== 'done') return null
  return (
    <HStack align="start" spacing={2} fontSize="sm" bg="bg.subtle" borderRadius="lg" px={3} py={2} {...props}>
      <Box pt="3px" color="accent.fg" flexShrink={0}><Sparkle size={14} fill="currentColor" aria-hidden /></Box>
      <Text>{t('import.some', { count, total })}</Text>
    </HStack>
  )
}
