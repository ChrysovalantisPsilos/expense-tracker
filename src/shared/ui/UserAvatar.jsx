import { Avatar } from '@chakra-ui/react'

// A person's avatar. `highlight` (the current user) forces the brand color so
// "you" looks identical everywhere — Settings, nav, and your own group row.
// Everyone else keeps Chakra's name-derived color so members stay distinct.
export default function UserAvatar({ name, src, highlight = false, ...props }) {
  const brand = highlight ? { bg: 'accent.solid', color: 'white' } : {}
  return <Avatar name={name} src={src} {...brand} {...props} />
}
