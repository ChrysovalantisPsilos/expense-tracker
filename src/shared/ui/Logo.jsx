import { HStack, Image, Text } from '@chakra-ui/react'

// Budgeer logo: a lowercase b whose bowl is a budget progress ring + wordmark. `showWord` toggles the text
// (hidden when the sidebar is collapsed / on tight spaces).
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
    </HStack>
  )
}
