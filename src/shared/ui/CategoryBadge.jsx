import { Flex } from '@chakra-ui/react'
import { categoryIcon } from '../lib/icons.jsx'

// Soft rounded square holding a category's Lucide icon.
export default function CategoryBadge({ category, size = 40, kind }) {
  const Icon = categoryIcon(category ?? '')
  return (
    <Flex
      align="center" justify="center" flexShrink={0}
      boxSize={`${size}px`} borderRadius="lg" bg="bg.subtle"
      color={kind === 'income' ? 'status.positive' : 'accent.fg'}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </Flex>
  )
}
