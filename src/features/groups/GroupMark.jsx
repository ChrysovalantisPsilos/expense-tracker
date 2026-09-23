import { Avatar } from '@chakra-ui/react'
import { Users } from 'lucide-react'
import IconTile from '../../shared/ui/kit/IconTile.jsx'

// A group's picture: the owner's uploaded photo, or — like the landing's
// "Lisbon weekend" card — the solid brand tile with a people icon. `size` in
// px; tiles from 40px up take the larger radius.
export default function GroupMark({ name, src, size = 40 }) {
  const radius = size >= 40 ? 'xl' : 'lg'
  if (!src) return <IconTile icon={Users} size={size} variant="solid" radius={radius} />
  return (
    <Avatar src={src} name={name} boxSize={`${size}px`} borderRadius={radius} flexShrink={0}
      bg="brand.500" color="white" />
  )
}
