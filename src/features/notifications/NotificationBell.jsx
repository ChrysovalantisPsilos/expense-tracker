import { useNavigate } from 'react-router-dom'
import {
  Box, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader,
  IconButton, Badge, Stack, HStack, Text, Flex, Divider, useDisclosure, Button,
} from '@chakra-ui/react'
import {
  Bell, UserPlus, ReceiptText, HandCoins, MessageSquare, CalendarClock,
  UserCheck, UserMinus, PiggyBank, BarChart3, BellRing,
} from 'lucide-react'
import QueryError from '../../shared/ui/QueryError.jsx'
import { SHORT_LANDSCAPE } from '../../shared/lib/shortLandscape.js'
import { markAllRead } from './notifications.js'
import { badgeText, notificationPath, unreadCount } from './bellMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const ICON = {
  invite: UserPlus, expense: ReceiptText, settlement: HandCoins,
  comment: MessageSquare, reminder: CalendarClock,
  member_joined: UserCheck, member_left: UserMinus,
  budget: PiggyBank, digest: BarChart3, nudge: BellRing,
}

// `feed` is the shell's one useNotificationFeed() — the mobile, desktop and
// sideways bells share it rather than each opening a channel. The list opens
// under the bell; on a phone held sideways it's capped to the short screen.
export default function NotificationBell({ feed }) {
  const t = useT('notifications')
  const navigate = useNavigate()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { items, error, reload, setItems } = feed

  const unread = unreadCount(items)
  const label = unread > 0 ? t('bell.labelUnread', { count: unread }) : t('bell.title')

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
    const path = notificationPath(n)
    if (path) navigate(path)
  }

  const list = (
    <PopoverContent w="320px">
      <PopoverHeader>{t('bell.title')}</PopoverHeader>
      <PopoverBody px={0} maxH="380px" overflowY="auto"
        sx={{ [SHORT_LANDSCAPE]: { maxH: 'calc(100dvh - 120px)' } }}>
        {error ? (
          <QueryError error={error} onRetry={reload} what={t('bell.what')} py={4} />
        ) : items.length === 0 ? (
          <Text px={4} py={6} color="text.muted" fontSize="sm" textAlign="center">
            {t('bell.empty')}
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
            {t('bell.viewInvites')}
          </Button>
        </Box>
      )}
    </PopoverContent>
  )

  // The IconButton itself is the trigger, so aria-expanded sits on the
  // button; the count badge is visual only (the label carries it).
  return (
    <Popover isOpen={isOpen} onOpen={handleOpen} onClose={onClose} placement="bottom-end">
      <Box position="relative" display="inline-flex">
        <PopoverTrigger>
          <IconButton aria-label={label} variant="ghost" size="sm" icon={<Bell size={18} />} />
        </PopoverTrigger>
        {unread > 0 && (
          <Badge position="absolute" top="-2px" right="-2px" borderRadius="full" aria-hidden
            pointerEvents="none" bg="accent.solid" color="white" fontSize="0.6rem" minW="16px"
            textAlign="center" px={1}>
            {badgeText(unread)}
          </Badge>
        )}
      </Box>
      {list}
    </Popover>
  )
}
