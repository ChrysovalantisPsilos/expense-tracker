import { HStack } from '@chakra-ui/react'
import { Sparkle } from 'lucide-react'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The one mark every AI suggestion carries until the user changes it: a
// small sparkle and "Suggested".
export default function SuggestedMark(props) {
  const t = useT('ai')
  return (
    <HStack as="span" display="inline-flex" spacing={1} color="accent.fg" fontSize="xs" fontWeight="600"
      verticalAlign="middle" flexShrink={0} {...props}>
      <Sparkle size={12} fill="currentColor" aria-hidden />
      <span>{t('suggested')}</span>
    </HStack>
  )
}
