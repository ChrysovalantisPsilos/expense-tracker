import { HStack, IconButton, Text, Spacer } from '@chakra-ui/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// Prev / "X of Y" / Next footer. Renders nothing for a single page.
export default function Paginator({ page, count, onPage }) {
  const t = useT()
  if (count <= 1) return null
  return (
    <HStack pt={3} spacing={2}>
      <Spacer />
      <IconButton aria-label={t('paginator.previous')} size="xs" variant="ghost"
        icon={<ChevronLeft size={16} />} isDisabled={page <= 1}
        onClick={() => onPage(page - 1)} />
      <Text fontSize="xs" color="text.muted" minW="72px" textAlign="center">
        {t('paginator.position', { page, pages: count })}
      </Text>
      <IconButton aria-label={t('paginator.next')} size="xs" variant="ghost"
        icon={<ChevronRight size={16} />} isDisabled={page >= count}
        onClick={() => onPage(page + 1)} />
    </HStack>
  )
}
