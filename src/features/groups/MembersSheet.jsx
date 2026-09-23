import {
  Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter,
  DrawerCloseButton, Badge, Button, Divider, HStack, IconButton, List, ListItem,
  SimpleGrid, Text, useBreakpointValue,
} from '@chakra-ui/react'
import { Mail, Link2, UserMinus, LogOut } from 'lucide-react'
import { pluralise, sortMembers } from './groupFormat.js'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'

// Who's in the group: the member list (you and the owner first, no balances —
// "Who owes whom" covers those), invite by email or link, and — for the
// owner — remove buttons. A bottom sheet on phones, a right panel on desktop.
// Every action is a callback; confirmations stay with the page. `onLeave` is
// omitted when the viewer isn't a member.
export default function MembersSheet({
  isOpen, onClose, members, myUserId, isOwner,
  onInviteEmail, onInviteLink, onRemove, onLeave,
}) {
  const placement = useBreakpointValue({ base: 'bottom', md: 'right' }, { ssr: false })
  const bottom = placement === 'bottom'
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement={placement} size={bottom ? 'full' : 'sm'}>
      <DrawerOverlay />
      <DrawerContent maxH={bottom ? '85dvh' : undefined} h={bottom ? 'auto' : undefined}
        borderTopRadius={bottom ? '2xl' : 0} borderLeftWidth={bottom ? 0 : '1px'}>
        <DrawerCloseButton top={4} />
        <DrawerHeader pb={1}>Members</DrawerHeader>
        <DrawerBody pt={0}>
          <Text fontSize="sm" color="text.muted" mb={2}>{pluralise(members.length, 'member')}</Text>
          <List spacing={0}>
            {sortMembers(members, myUserId).map((m, i) => {
              const isMe = m.user_id === myUserId
              return (
                <ListItem key={m.id}>
                  {i > 0 && <Divider />}
                  <HStack py={2.5} spacing={3}>
                    <UserAvatar size="sm" name={m.display_name} src={m.avatar_url} highlight={isMe} />
                    <Text fontWeight={isMe ? '700' : '500'} minW={0} overflowWrap="anywhere">
                      {m.display_name}{isMe ? ' (you)' : ''}
                    </Text>
                    {m.role === 'owner' && <Badge colorScheme="brand" flexShrink={0}>Owner</Badge>}
                    {isOwner && !isMe && (
                      <IconButton aria-label={`Remove ${m.display_name}`} size="sm" variant="ghost"
                        ml="auto" flexShrink={0} color="status.negative" icon={<UserMinus size={16} />}
                        onClick={() => onRemove(m)} />
                    )}
                  </HStack>
                </ListItem>
              )
            })}
          </List>

          <Text fontSize="sm" fontWeight="600" mt={6} mb={2}>Invite people</Text>
          <SimpleGrid columns={2} spacing={2}>
            <Button variant="outline" size="sm" leftIcon={<Mail size={16} />} onClick={onInviteEmail}>
              Email
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Link2 size={16} />} onClick={onInviteLink}>
              Copy link
            </Button>
          </SimpleGrid>
          <Text fontSize="xs" color="text.muted" mt={2}>
            Invite people by email or a share link — they join once they accept.
          </Text>
        </DrawerBody>
        {onLeave && (
          <DrawerFooter borderTopWidth="1px" borderColor="border.default" justifyContent="flex-start">
            <Button variant="ghost" size="sm" ml={-3} color="status.negative" leftIcon={<LogOut size={16} />}
              onClick={onLeave}>
              Leave group
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  )
}
