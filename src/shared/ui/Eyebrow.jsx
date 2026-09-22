import { Text } from '@chakra-ui/react'

// Small uppercase coral label that sits above a title, as on the landing
// page's section headings. Extra props pass through to the Text.
export default function Eyebrow({ children, ...props }) {
  return (
    <Text fontSize="xs" fontWeight="700" color="accent.fg" textTransform="uppercase"
      letterSpacing="0.08em" lineHeight="1.4" {...props}>
      {children}
    </Text>
  )
}
