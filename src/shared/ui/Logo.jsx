import { Box, HStack, Image, Text } from '@chakra-ui/react'
import { isTestSite } from '../lib/environment.js'

// Budgeer logo: a lowercase b whose bowl is a budget progress ring + wordmark. `showWord` toggles the text
// (hidden when the sidebar is collapsed / on tight spaces). On the test site
// it carries a "DEV" tag for everyone, so nobody mistakes it for the live site.
export default function Logo({ size = 32, showWord = true, ...props }) {
  return (
    <HStack spacing={2.5} {...props}>
      <Image src="/budgeer-mark.svg" alt="Budgeer" boxSize={`${size}px`} />
      {showWord && (
        <Text
          fontFamily="heading"
          fontWeight="700"
          fontSize={`${Math.round(size * 0.62)}px`}
          letterSpacing="-0.02em"
          color="text.primary"
        >
          budgeer
        </Text>
      )}
      {isTestSite && (
        <Box as="span" title="Test site: separate from budgeer.com" flexShrink={0}
          px={1.5} py={0.5} borderRadius="md" fontSize="11px" fontWeight="800"
          letterSpacing="0.06em" lineHeight="1.2"
          bg="amber.100" color="amber.900" _dark={{ bg: 'amber.400', color: 'sand.900' }}>
          DEV
        </Box>
      )}
    </HStack>
  )
}
