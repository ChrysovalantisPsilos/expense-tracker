import { Flex } from '@chakra-ui/react'
import { textColor } from './kitMath.js'

// A square rounded tile holding a Lucide icon: sand with an accent icon
// (`subtle`, the default) or filled brand with a white icon (`solid`, e.g. a
// group's hero tile). `tone` recolours a subtle tile's icon (e.g. 'positive'
// for income). The icon is half the tile's size.
export default function IconTile({ icon: Icon, size = 32, variant = 'subtle', tone = 'accent', radius = 'lg', ...props }) {
  const solid = variant === 'solid'
  return (
    <Flex boxSize={`${size}px`} borderRadius={radius} flexShrink={0} align="center" justify="center"
      bg={solid ? 'brand.500' : 'bg.subtle'} color={solid ? 'white' : textColor(tone)} {...props}>
      <Icon size={Math.round(size / 2)} />
    </Flex>
  )
}
