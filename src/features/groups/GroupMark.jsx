import { Avatar, Flex } from '@chakra-ui/react'
import { Users } from 'lucide-react'
import { groupColour } from './groupCover.js'

// A group's picture: the owner's uploaded photo, or a tile with a people
// icon in the group's own colour (groupCover.groupColour of `colourKey`, the
// group's id — its name where no id is known). `size` in px; tiles from 40px
// up take the larger radius.
export default function GroupMark({ name, src, colourKey, size = 40 }) {
  const radius = size >= 40 ? 'xl' : 'lg'
  if (!src) {
    const { from, to } = groupColour(colourKey ?? name)
    return (
      <Flex boxSize={`${size}px`} borderRadius={radius} flexShrink={0} align="center" justify="center"
        bgGradient={`linear(to-br, ${from}, ${to})`} color="white" aria-hidden="true">
        <Users size={Math.round(size / 2)} />
      </Flex>
    )
  }
  return (
    <Avatar src={src} name={name} boxSize={`${size}px`} borderRadius={radius} flexShrink={0}
      bg="brand.500" color="white" />
  )
}
