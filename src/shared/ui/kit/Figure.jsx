import { Box, HStack, Text } from '@chakra-ui/react'
import { textColor } from './kitMath.js'
import { Reveal } from './motion.jsx'

// 'hero': the page's headline number — xl on phones, larger from laptop width.
const VALUE_SIZE = { sm: 'sm', md: 'md', lg: 'xl', xl: '3xl', hero: { base: '3xl', lg: '5xl' } }

// A headline number: small muted `label` above a big bold Poppins `value`
// ("Total" / "€357.00"). `layout="inline"` puts the label left and the value
// right on one row (a card's total line). `tone` colours the value; `align`
// right-aligns the stacked form. Optional `playback`/`delay` reveal the value.
export default function Figure({ label, value, tone = 'default', size = 'md', layout = 'stack', align = 'left', playback, delay, ...props }) {
  const number = (
    <Text fontFamily="heading" fontWeight="700" fontSize={VALUE_SIZE[size]} color={textColor(tone)}
      lineHeight={size === 'xl' || size === 'hero' ? 1.15 : undefined} whiteSpace="nowrap">
      {value}
    </Text>
  )
  const shown = playback ? <Reveal playback={playback} delay={delay}>{number}</Reveal> : number
  if (layout === 'inline') {
    return (
      <HStack justify="space-between" spacing={3} {...props}>
        <Text fontSize="sm" color="text.muted">{label}</Text>
        {shown}
      </HStack>
    )
  }
  return (
    <Box textAlign={align} minW={0} {...props}>
      <Text fontSize="xs" color="text.muted">{label}</Text>
      {shown}
    </Box>
  )
}
