import { Suspense, useEffect, useState } from 'react'
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Box, Flex, HStack, VStack, IconButton, Text, Spacer, Tooltip,
} from '@chakra-ui/react'
import UserAvatar from '../shared/ui/UserAvatar.jsx'
import {
  LayoutDashboard, ReceiptText, Target, Users,
  LogOut, Repeat, TrendingUp, MoreHorizontal, Settings,
} from 'lucide-react'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import { useProfile } from '../shared/lib/ProfileProvider.jsx'
import Logo from '../shared/ui/Logo.jsx'
import PageSpinner from '../shared/ui/PageSpinner.jsx'
import OfflineIndicator from '../shared/ui/OfflineIndicator.jsx'
import ThemeToggle from '../shared/ui/ThemeToggle.jsx'
import NotificationBell from '../features/notifications/NotificationBell.jsx'
import { useNotificationFeed } from '../features/notifications/notifications.js'
import { isNavActive } from './navMatch.js'

// Primary destinations — shown in the mobile bottom bar and at the top of the
// desktop sidebar. `tour` names the app tour's stop (data-tour, tourSteps.js).
const PRIMARY = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText, tour: 'nav-transactions' },
  { to: '/groups', label: 'Groups', icon: Users, tour: 'nav-groups' },
  { to: '/budgets', label: 'Budgets', icon: Target, tour: 'nav-budgets' },
]
// Secondary destinations — listed directly in the desktop sidebar, and gathered
// under the "More" tab on mobile.
const SECONDARY = [
  { to: '/insights', label: 'Insights', icon: TrendingUp },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
]
// Mobile bottom bar: the four primary tabs plus a "More" entry.
// Which tab is lit for a given page is decided by navMatch.js.
const MOBILE_NAV = [...PRIMARY, { to: '/more', label: 'More', icon: MoreHorizontal, tour: 'nav-more' }]

// A nav link that knows whether it's the current section (see navMatch.js).
// `children` renders from the active flag.
function NavItem({ to, children, ...rest }) {
  const { pathname } = useLocation()
  const isActive = isNavActive(to, pathname)
  return (
    <RouterLink to={to} aria-current={isActive ? 'page' : undefined} {...rest}>
      {children(isActive)}
    </RouterLink>
  )
}

function SideItem({ to, label, icon: Icon, tour }) {
  return (
    <NavItem to={to} style={{ width: '100%' }} data-tour={tour}>
      {(isActive) => (
        <HStack
          spacing={3} px={3} py={2.5} borderRadius="lg" w="full"
          color={isActive ? 'accent.fg' : 'text.muted'}
          bg={isActive ? 'bg.subtle' : 'transparent'}
          fontWeight={isActive ? '600' : '500'}
          _hover={{ bg: 'bg.subtle', color: 'text.primary' }}
          transition="all 0.15s"
        >
          <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
          <Text fontSize="sm">{label}</Text>
        </HStack>
      )}
    </NavItem>
  )
}

function TabItem({ to, label, icon: Icon, tour }) {
  return (
    <NavItem to={to} data-tour={tour}>
      {(isActive) => (
        <VStack spacing={0.5} px={2} py={1} minW="60px"
          color={isActive ? 'accent.fg' : 'text.muted'}>
          <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
          <Text fontSize="10px" fontWeight={isActive ? '600' : '500'}>{label}</Text>
        </VStack>
      )}
    </NavItem>
  )
}

export default function AppShell() {
  const { signOut } = useAuth()
  const { profile } = useProfile()
  // One live feed for both bells (mobile top bar + desktop header).
  const feed = useNotificationFeed()
  const location = useLocation()
  const [, setTick] = useState(0)
  useEffect(() => { setTick((n) => n + 1) }, [location])

  return (
    <Flex minH="100dvh" bg="bg.canvas">
      {/* Desktop sidebar */}
      <Flex
        as="nav" direction="column" w="240px" p={4} gap={1}
        borderRightWidth="1px" borderColor="border.default" bg="bg.surface"
        position="sticky" top={0} h="100dvh"
        display={{ base: 'none', md: 'flex' }}
      >
        <Box px={2} py={2} mb={2}><Logo size={30} /></Box>
        {PRIMARY.map((n) => <SideItem key={n.to} {...n} />)}
        <Box h="1px" bg="border.default" my={2} mx={2} />
        <Flex direction="column" gap={1} data-tour="nav-more">
          {SECONDARY.map((n) => <SideItem key={n.to} {...n} />)}
        </Flex>
        <Spacer />
        <Flex direction="column" gap={1} data-tour="account">
          <NavItem to="/settings" title="Settings" style={{ width: '100%' }}>
            {(isActive) => (
              <HStack spacing={3} px={3} py={2} borderRadius="lg" w="full" mb={1}
                bg={isActive ? 'bg.subtle' : 'transparent'} _hover={{ bg: 'bg.subtle' }}>
                <UserAvatar size="xs" name={profile?.display_name}
                  src={profile?.avatar_url} highlight />
                <Text fontSize="sm" fontWeight="500" flex="1" minW={0} overflowWrap="anywhere">
                  {profile?.display_name || 'Settings'}
                </Text>
                <Box as="span" color={isActive ? 'accent.fg' : 'text.muted'} flexShrink={0}>
                  <Settings size={16} />
                </Box>
              </HStack>
            )}
          </NavItem>
          <HStack px={1} justify="space-between">
            <Tooltip label="Toggle theme">
              <ThemeToggle />
            </Tooltip>
            <Tooltip label="Sign out">
              <IconButton aria-label="Sign out" variant="ghost" size="sm"
                icon={<LogOut size={18} />} onClick={signOut} />
            </Tooltip>
          </HStack>
        </Flex>
      </Flex>

      {/* Main column */}
      <Flex direction="column" flex="1" minW={0}>
        {/* Mobile top bar */}
        <Flex
          as="header" align="center" px={4} py={3} gap={3}
          borderBottomWidth="1px" borderColor="border.default" bg="bg.surface"
          position="sticky" top={0} zIndex={10}
          display={{ base: 'flex', md: 'none' }}
        >
          <Logo size={26} />
          <Spacer />
          <OfflineIndicator />
          <Flex align="center" gap={3} data-tour="account">
            <NotificationBell feed={feed} />
            <ThemeToggle />
            <RouterLink to="/settings" aria-label="Settings">
              <UserAvatar size="sm" name={profile?.display_name}
                src={profile?.avatar_url} highlight />
            </RouterLink>
          </Flex>
        </Flex>

        {/* Desktop header strip (sync badges + notifications) */}
        <Flex display={{ base: 'none', md: 'flex' }} justify="flex-end" align="center"
          gap={2} px={6} pt={4}>
          <OfflineIndicator />
          <NotificationBell feed={feed} />
        </Flex>

        <Box as="main" flex="1" px={{ base: 4, md: 6 }} py={{ base: 4, md: 4 }}
          pb={{ base: '92px', md: 8 }} maxW="900px" w="full" mx="auto">
          {/* Pages are lazy chunks: the shell stays put while one loads. */}
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </Box>
      </Flex>

      {/* Mobile bottom nav */}
      <HStack
        as="nav" spacing={0} justify="space-around" px={2} py={1.5}
        borderTopWidth="1px" borderColor="border.default" bg="bg.surface"
        position="fixed" bottom={0} left={0} right={0} zIndex={10}
        display={{ base: 'flex', md: 'none' }}
      >
        {MOBILE_NAV.map((n) => <TabItem key={n.to} {...n} />)}
      </HStack>
    </Flex>
  )
}
