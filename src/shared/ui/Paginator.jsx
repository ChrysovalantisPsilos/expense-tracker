import { HStack, IconButton, Text, Spacer } from '@chakra-ui/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Prev / "X of Y" / Next footer. Renders nothing for a single page.
export default function Paginator({ page, count, onPage }) {
  if (count <= 1) return null
  return (
    <HStack pt={3} spacing={2}>
      <Spacer />
      <IconButton aria-label="Previous page" size="xs" variant="ghost"
        icon={<ChevronLeft size={16} />} isDisabled={page <= 1}
        onClick={() => onPage(page - 1)} />
      <Text fontSize="xs" color="text.muted" minW="72px" textAlign="center">
        Page {page} of {count}
      </Text>
      <IconButton aria-label="Next page" size="xs" variant="ghost"
        icon={<ChevronRight size={16} />} isDisabled={page >= count}
        onClick={() => onPage(page + 1)} />
    </HStack>
  )
}
