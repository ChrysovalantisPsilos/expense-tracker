import { Flex } from '@chakra-ui/react'
import { avatarStack, sortMembers } from './groupFormat.js'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'

// Overlapping member avatars (you and the owner first) with a "+N" chip past
// four. Purely visual; `ring` is the colour of the surface it sits on, so
// the overlaps read as cut-outs.
export default function AvatarStack({ members, myUserId, ring = 'bg.canvas' }) {
  const { shown, overflow } = avatarStack(sortMembers(members, myUserId))
  const border = { borderWidth: '2px', borderColor: ring }
  return (
    <Flex as="span" flexShrink={0}>
      {shown.map((m, i) => (
        <UserAvatar key={m.id} size="xs" name={m.display_name} src={m.avatar_url}
          highlight={m.user_id === myUserId} {...border} ml={i ? -2 : 0} zIndex={shown.length - i} />
      ))}
      {overflow > 0 && (
        <Flex as="span" boxSize="24px" {...border} ml={-2} borderRadius="full" bg="bg.subtle"
          color="text.muted" fontSize="2xs" fontWeight="700" align="center" justify="center">
          +{overflow}
        </Flex>
      )}
    </Flex>
  )
}
