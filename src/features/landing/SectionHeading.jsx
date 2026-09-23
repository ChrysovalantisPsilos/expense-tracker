import { Heading, Stack, Text } from '@chakra-ui/react'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'

// A landing section's opener: coral eyebrow, an h2 title and an optional
// muted lead paragraph.
export default function SectionHeading({ eyebrow, title, children }) {
  return (
    <Stack spacing={3} maxW="xl">
      <Eyebrow fontSize="sm" lineHeight="base">{eyebrow}</Eyebrow>
      <Heading as="h2" fontSize={{ base: '2xl', md: '3xl' }} letterSpacing="-0.02em" lineHeight="1.15">
        {title}
      </Heading>
      {children && <Text color="text.muted" fontSize={{ base: 'md', md: 'lg' }}>{children}</Text>}
    </Stack>
  )
}
