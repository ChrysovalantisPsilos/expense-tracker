import { useNavigate } from 'react-router-dom'
import {
  Box, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader,
  IconButton, Badge, Stack, HStack, Text, Flex, Divider, useDisclosure, Button, Portal,
} from '@chakra-ui/react'
import {
  Bell, UserPlus, ReceiptText, HandCoins, MessageSquare, CalendarClock,
  UserCheck, UserMinus, PiggyBank, BarChart3, BellRing,
} from 'lucide-react'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SHORT_LANDSCAPE } from '../../shared/lib/shortLandscape.js'
import { markAllRead } from './notifications.js'

const ICON = {
  invite: UserPlus, expense: ReceiptText, settlement: HandCoins,
  comment: MessageSquare, reminder: CalendarClock,
  member_joined: UserCheck, member_left: UserMinus,
  budget: PiggyBank, digest: BarChart3, nudge: BellRing,
}

// `feed` is the shell's one useNotificationFeed() — the mobile and desktop
// bells share it rather than each opening a channel. `rail`: the bell sits in
// the landscape phone's side rail, so the list opens to its right, portalled
// out of the rail (which scrolls, and would clip it).
export default function NotificationBell({ feed, rail = false }) {
  const navigate = useNavigate()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { items, error, reload, setItems } = feed

  const unread = items.filter((n) => !n.read_at).length
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  async function handleOpen() {
    onOpen()
    if (unread > 0) {
      // optimistic: mark read locally, then persist
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
      try { await markAllRead() } catch { /* ignore */ }
    }
  }

  function go(n) {
    onClose()
    if (n.type === 'invite') navigate('/groups')
    else if (n.type === 'reminder') navigate('/recurring')
    else if (n.type === 'budget') navigate('/budgets')
    else if (n.type === 'digest') navigate('/')
    else if (n.group_id) navigate(`/groups/${n.group_id}`)
  }

  const list = (
    <PopoverContent w="320px">
      <PopoverHeader>Notifications</PopoverHeader>
      <PopoverBody px={0} maxH="380px" overflowY="auto"
        sx={{ [SHORT_LANDSCAPE]: { maxH: 'calc(100dvh - 120px)' } }}>
        {error ? (
          <QueryError error={error} onRetry={reload} what="notifications" py={4} />
        ) : items.length === 0 ? (
          <Text px={4} py={6} color="text.muted" fontSize="sm" textAlign="center">
            You’re all caught up.
          </Text>
        ) : (
          <Stack spacing={0}>
            {items.map((n, i) => {
              const Icon = ICON[n.type] ?? Bell
              return (
                <Box key={n.id}>
                  {i > 0 && <Divider />}
                  <HStack as="button" type="button" w="full" textAlign="left" px={4} py={3}
                    spacing={3} align="start" _hover={{ bg: 'bg.subtle' }}
                    _focusVisible={{ bg: 'bg.subtle', outline: 'none', boxShadow: 'inset 0 0 0 2px var(--chakra-colors-accent-fg)' }}
                    onClick={() => go(n)}>
                    <Flex boxSize="32px" flexShrink={0} align="center" justify="center"
                      borderRadius="lg" bg="bg.subtle" color="accent.fg"><Icon size={16} /></Flex>
                    <Stack spacing={0} flex="1" minW={0} overflowWrap="anywhere">
                      <Text fontSize="sm" fontWeight={n.read_at ? '500' : '700'}>{n.title}</Text>
                      {n.body && <Text fontSize="xs" color="text.muted">{n.body}</Text>}
                    </Stack>
                  </HStack>
                </Box>
              )
            })}
          </Stack>
        )}
      </PopoverBody>
      {items.some((n) => n.type === 'invite') && (
        <Box px={4} py={2} borderTopWidth="1px">
          <Button size="sm" variant="ghost" w="full" onClick={() => go({ type: 'invite' })}>
            View invites
          </Button>
        </Box>
      )}
    </PopoverContent>
  )

  // The IconButton itself is the trigger, so aria-expanded sits on the
  // button; the count badge is visual only (the label carries it).
  return (
    <Popover isOpen={isOpen} onOpen={handleOpen} onClose={onClose} placement={rail ? 'right-end' : 'bottom-end'}>
      <Box position="relative" display="inline-flex">
        <PopoverTrigger>
          <IconButton aria-label={label} variant="ghost" size="sm" icon={<Bell size={18} />} />
        </PopoverTrigger>
        {unread > 0 && (
          <Badge position="absolute" top="-2px" right="-2px" borderRadius="full" aria-hidden
            pointerEvents="none" bg="accent.solid" color="white" fontSize="0.6rem" minW="16px"
            textAlign="center" px={1}>
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </Box>
      {rail ? <Portal>{list}</Portal> : list}
    </Popover>
  )
}
