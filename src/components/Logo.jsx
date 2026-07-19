import { HStack, Image, Text } from '@chakra-ui/react'

// Budge logo: coin-with-a-nudge mark + wordmark. `showWord` toggles the text
// (hidden when the sidebar is collapsed / on tight spaces).
export default function Logo({ size = 32, showWord = true, ...props }) {
  return (
    <HStack spacing={2.5} {...props}>
      <Image src="/budge-mark.svg" alt="Budge" boxSize={`${size}px`} />
      {showWord && (
        <Text
          fontFamily="heading"
          fontWeight="700"
          fontSize={`${Math.round(size * 0.62)}px`}
          letterSpacing="-0.02em"
          color="text.primary"
        >
          budge
        </Text>
      )}
    </HStack>
  )
}
