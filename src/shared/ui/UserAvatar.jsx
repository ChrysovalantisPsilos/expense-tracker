import { Avatar } from '@chakra-ui/react'
import { avatarInitials, avatarLook } from './avatarLook.js'

// A person's avatar. `highlight` (the current user) forces the brand color so
// "you" looks identical everywhere — Settings, nav, and your own group row.
// Everyone else keeps the name-derived color so members stay distinct; the
// initials and the text colour follow avatarLook (the native app's too).
export default function UserAvatar({ name, src, highlight = false, ...props }) {
  const look = avatarLook(name, { highlight })
  const colours = highlight
    ? { bg: 'accent.solid', color: 'white' }
    : name ? { color: look.fg === 'light' ? 'white' : 'gray.800' } : {}
  return <Avatar name={name} src={src} getInitials={avatarInitials} {...colours} {...props} />
}
