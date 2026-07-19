import { Flex } from '@chakra-ui/react'
import { categoryIcon } from '../lib/icons.jsx'

// Soft rounded square holding a category's Lucide icon.
export default function CategoryBadge({ category, size = 40, kind }) {
  const Icon = categoryIcon(category ?? '')
  const isIncome = kind === 'income'
  return (
    <Flex
      align="center" justify="center" flexShrink={0}
      boxSize={`${size}px`} borderRadius="lg"
      bg={isIncome ? 'green.50' : 'bg.subtle'}
      color={isIncome ? 'green.500' : 'accent.fg'}
      _dark={{ bg: isIncome ? 'whiteAlpha.100' : 'bg.subtle' }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </Flex>
  )
}
