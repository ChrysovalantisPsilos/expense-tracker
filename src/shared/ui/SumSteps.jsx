import { HStack, Stack, Text } from '@chakra-ui/react'
import { textColor } from './kit/kitMath.js'

// "How it adds up" inside an ⓘ box (InfoToggle.InfoBox): a title, each step
// with its signed amount, a rule, then the total in its tone. Home's "How Net
// adds up" and Plan's left-over use it. A step (or the total) with `was`
// shows the value it had before struck through beside it, muted: Plan's
// "now → planned".
//   steps  [{ key, label, value, was? }]   (value/was: formatted strings)
//   total  { label, value, tone, was? }    (tone: kitMath.signTone's)
export default function SumSteps({ title, steps, total }) {
  const row = (label, value, was, props) => (
    <HStack justify="space-between" spacing={3} {...props}>
      <Text>{label}</Text>
      <Text whiteSpace="nowrap" fontWeight="600" color="text.primary">
        {was && <Was value={was} />}
        {value}
      </Text>
    </HStack>
  )
  return (
    <Stack spacing={1} fontSize="sm">
      <Text fontWeight="700" color="text.primary">{title}</Text>
      {steps.map((s) => row(s.label, s.value, s.was, { key: s.key }))}
      <HStack justify="space-between" pt={1} mt={1} borderTopWidth="1px" borderColor="border.default">
        <Text fontWeight="700" color="text.primary">{total.label}</Text>
        <Text whiteSpace="nowrap" fontWeight="700" color={textColor(total.tone)}>
          {total.was && <Was value={total.was} />}
          {total.value}
        </Text>
      </HStack>
    </Stack>
  )
}

function Was({ value }) {
  return <Text as="s" fontSize="xs" fontWeight="400" color="text.muted" mr={1.5}>{value}</Text>
}
