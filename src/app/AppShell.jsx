import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Box, Button, Flex, HStack, VStack, IconButton, Text, Spacer, Tooltip,
} from '@chakra-ui/react'
import UserAvatar from '../shared/ui/UserAvatar.jsx'
import {
  LayoutDashboard, ReceiptText, Target, Users,
  LogOut, Repeat, TrendingUp, MoreHorizontal, Settings, Plus,
} from 'lucide-react'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import { useProfile } from '../shared/lib/ProfileProvider.jsx'
import Logo from '../shared/ui/Logo.jsx'
import RingLoader from '../shared/ui/RingLoader.jsx'
import OfflineIndicator from '../shared/ui/OfflineIndicator.jsx'
import ThemeToggle from '../shared/ui/ThemeToggle.jsx'
import SiteSwitch from '../shared/ui/SiteSwitch.jsx'
import NotificationBell from '../features/notifications/NotificationBell.jsx'
import { useNotificationFeed } from '../features/notifications/notifications.js'
import { isAccountPage, isNavActive, showsAddExpense } from './navMatch.js'
import ErrorBoundary from './ErrorBoundary.jsx'
import { MAIN_ID } from '../shared/ui/SkipLink.jsx'
import { EmptyStateCount } from '../shared/ui/EmptyState.jsx'
import { InAppShell } from '../shared/ui/inAppShell.js'
import { useShortLandscape } from '../shared/ui/useShortLandscape.js'
import { ShellHeaderSlots } from '../shared/ui/ShellHeader.jsx'
import { COLUMN_BOX, GUTTER, HEADER_H, RAIL_BOX } from '../shared/lib/shortLandscape.js'

// Primary destinations — shown in the mobile bottom bar and at the top of the
// desktop sidebar. `tour` names the app tour's stop (data-tour, tourSteps.js).
const PRIMARY = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/groups', label: 'Groups', icon: Users, tour: 'nav-groups' },
  { to: '/budgets', label: 'Budgets', icon: Target, tour: 'nav-budgets' },
]
// Secondary destinations — listed directly in the desktop sidebar, and gathered
// under the "More" tab on mobile.
const SECONDARY = [
  { to: '/insights', label: 'Insights', icon: TrendingUp },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
]
// Mobile bottom bar (and a landscape phone's rail): the four primary tabs
// plus a "More" entry.
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

// An icon over a small label: the phone's bottom bar.
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

// The phone's bottom bar is this tall above the safe-area inset; the
// floating Add expense button sits just above it.
const TAB_BAR_H = '60px'
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)'
const NEW_EXPENSE = '/transactions/new'

// Phone only: a round "Add expense" button above the bottom bar, on the main
// tabs (navMatch.showsAddExpense). The shell hides it while the app tour runs
// so it never sits over a highlighted stop.
function AddExpenseFab() {
  return (
    <IconButton as={RouterLink} to={NEW_EXPENSE} aria-label="Add expense"
      icon={<Plus size={26} strokeWidth={2.4} />} w="56px" h="56px" borderRadius="full"
      position="fixed" zIndex={10} boxShadow="lg"
      right="calc(16px + env(safe-area-inset-right, 0px))"
      bottom={`calc(${TAB_BAR_H} + 16px + ${SAFE_BOTTOM})`}
      display={{ base: 'inline-flex', md: 'none' }} />
  )
}

// A phone held sideways (useShortLandscape) has the width for the sidebar but
// not the height. A slim rail on the page's own background stands in for it
// (and for the phone's bottom bar): the logo, one Add expense, then the bottom
// bar's tabs as icons (their names are the links' labels and tooltips), the
// current one on a coral pill. The left notch's inset widens it, so the notch
// sits over the rail's background; it scrolls if a screen can't fit it all.
function NavRail() {
  return (
    <Flex
      as="nav" direction="column" align="center" gap={1.5} flexShrink={0} {...RAIL_BOX} pt={3}
      bg="bg.canvas" position="sticky" top={0} h="100dvh" overflowY="auto" overflowX="hidden"
    >
      <Logo size={24} showWord={false} stacked flexShrink={0} />
      <Tooltip label="Add expense" placement="right">
        <IconButton as={RouterLink} to={NEW_EXPENSE} aria-label="Add expense" data-tour="add-expense"
          icon={<Plus size={24} strokeWidth={2.4} />} boxSize="48px" minW="48px" borderRadius="xl"
          boxShadow="soft" my={2.5} flexShrink={0} />
      </Tooltip>
      {MOBILE_NAV.map((n) => <RailItem key={n.to} {...n} />)}
    </Flex>
  )
}

// One rail tab: a 48×44 icon link. Settings isn't lit here (the header's
// avatar is), so More stays dark on Settings pages (navMatch.accountApart).
function RailItem({ to, label, icon: Icon, tour }) {
  const { pathname } = useLocation()
  const active = isNavActive(to, pathname, { accountApart: true })
  return (
    <Tooltip label={label} placement="right">
      <Flex as={RouterLink} to={to} aria-label={label} aria-current={active ? 'page' : undefined}
        data-tour={tour} w="48px" h="44px" flexShrink={0} align="center" justify="center"
        borderRadius="xl" transition="background 0.15s, color 0.15s"
        color={active ? 'accent.fg' : 'text.muted'} bg={active ? 'accent.subtle' : 'transparent'}
        _hover={active ? undefined : { bg: 'bg.subtle', color: 'text.primary' }}
        _focusVisible={{ outline: 'none', boxShadow: 'outline' }}>
        <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
      </Flex>
    </Tooltip>
  )
}

// The sideways page's slim header, sticky at the top of the page column:
// the page's own row (PageHeader's title and controls, through the `title`
// slot), a form's Save (the `actions` slot), then the account icons — sync
// state, the live/test switch, the bell and your picture, which opens
// Settings and is ringed while you're there. It opens <main>, so the skip
// link lands on the page's title and controls.
function ShellBar({ feed, profile, onTitle, onActions }) {
  const { pathname } = useLocation()
  const account = isAccountPage(pathname)
  return (
    <Flex position="sticky" top={0} zIndex={10} h={`${HEADER_H}px`} align="center" gap={2}
      bg="bg.canvas" mx={`-${GUTTER}px`} px={`${GUTTER}px`} mb={1}>
      <Flex ref={onTitle} flex="1" minW={0} align="center" />
      <Flex ref={onActions} align="center" gap={2} flexShrink={0} _empty={{ display: 'none' }} />
      <Flex align="center" gap={2} flexShrink={0} data-tour="account">
        <OfflineIndicator />
        <SiteSwitch compact />
        <NotificationBell feed={feed} />
        <Tooltip label="Settings">
          <Box as={RouterLink} to="/settings" aria-label="Settings" aria-current={account ? 'page' : undefined}
            layerStyle="hitArea" display="flex" borderRadius="full" p="2px"
            boxShadow={account ? '0 0 0 2px var(--chakra-colors-accent-solid)' : undefined}
            _focusVisible={{ outline: 'none', boxShadow: 'outline' }}>
            <UserAvatar size="sm" name={profile?.display_name} src={profile?.avatar_url} highlight />
          </Box>
        </Tooltip>
      </Flex>
    </Flex>
  )
}

export default function AppShell({ hideAddExpense = false }) {
  const { signOut } = useAuth()
  const { profile } = useProfile()
  // One live feed for every bell (mobile top bar, desktop header, the
  // sideways header).
  const feed = useNotificationFeed()
  const location = useLocation()
  // How many empty states the page shows (EmptyState reports in and out).
  const [emptyStates, setEmptyStates] = useState(0)
  const countEmptyState = useCallback((delta) => setEmptyStates((n) => n + delta), [])
  const fab = !hideAddExpense && showsAddExpense(location.pathname, { emptyState: emptyStates > 0 })
  const [, setTick] = useState(0)
  useEffect(() => { setTick((n) => n + 1) }, [location])
  const rail = useShortLandscape()
  // The sideways header's slots (ShellHeader.jsx), once they've mounted.
  const [titleSlot, setTitleSlot] = useState(null)
  const [actionsSlot, setActionsSlot] = useState(null)
  const slots = useMemo(() => (rail ? { title: titleSlot, actions: actionsSlot } : null),
    [rail, titleSlot, actionsSlot])

  return (
    <Flex minH="100dvh" bg="bg.canvas">
      {rail ? <NavRail /> : (
      /* Desktop sidebar */
      <Flex
        as="nav" direction="column" w="240px" p={4} gap={1}
        borderRightWidth="1px" borderColor="border.default" bg="bg.surface"
        position="sticky" top={0} h="100dvh"
        display={{ base: 'none', md: 'flex' }}
      >
        <Box px={2} py={2} mb={2}><Logo size={30} /></Box>
        <Button as={RouterLink} to={NEW_EXPENSE} leftIcon={<Plus size={18} />} mb={3} mx={1}>
          Add expense
        </Button>
        {PRIMARY.map((n) => <SideItem key={n.to} {...n} />)}
        <Box h="1px" bg="border.default" my={2} mx={2} />
        <Flex direction="column" gap={1} data-tour="nav-more">
          {SECONDARY.map((n) => <SideItem key={n.to} {...n} />)}
        </Flex>
        <Spacer />
        <Flex direction="column" gap={1} data-tour="account">
          <SiteSwitch />
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
      )}

      {/* Main column */}
      <Flex direction="column" flex="1" minW={0}>
        {/* Mobile top bar */}
        {!rail && (
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
            <SiteSwitch compact />
            <NotificationBell feed={feed} />
            <ThemeToggle />
            <Box as={RouterLink} to="/settings" aria-label="Settings" layerStyle="hitArea" display="flex">
              <UserAvatar size="sm" name={profile?.display_name}
                src={profile?.avatar_url} highlight />
            </Box>
          </Flex>
        </Flex>
        )}

        {/* Desktop header strip (sync badges + notifications); the sideways
            header (ShellBar) holds both on a landscape phone. */}
        {!rail && (
        <Flex display={{ base: 'none', md: 'flex' }} justify="flex-end" align="center"
          gap={2} px={6} pt={4}>
          <OfflineIndicator />
          <NotificationBell feed={feed} />
        </Flex>
        )}

        <Box as="main" id={MAIN_ID} flex="1" w="full" mx="auto"
          {...(rail ? COLUMN_BOX : {
            maxW: '900px', px: { base: 4, md: 6 }, py: { base: 4, md: 4 },
            pb: { base: `calc(${fab ? '164px' : '92px'} + ${SAFE_BOTTOM})`, md: 8 },
          })}>
          {rail && <ShellBar feed={feed} profile={profile} onTitle={setTitleSlot} onActions={setActionsSlot} />}
          {/* Pages are lazy chunks: the shell stays put while one loads, and
              if one fails (a chunk gone after a deploy, offline, a crash) its
              error screen shows here, with the navigation still around it.
              Moving to another page tries again. */}
          <ErrorBoundary inline resetKey={location.pathname}>
            <Suspense fallback={<RingLoader />}>
              <EmptyStateCount.Provider value={countEmptyState}>
                <InAppShell.Provider value>
                  <ShellHeaderSlots.Provider value={slots}>
                    <Outlet />
                  </ShellHeaderSlots.Provider>
                </InAppShell.Provider>
              </EmptyStateCount.Provider>
            </Suspense>
          </ErrorBoundary>
        </Box>
      </Flex>

      {/* Mobile bottom nav (it also holds the floating Add expense button,
          so the button sits in a landmark) */}
      {!rail && (
      <HStack
        as="nav" spacing={0} justify="space-around" px={2} pt={1.5}
        pb={`calc(6px + ${SAFE_BOTTOM})`}
        borderTopWidth="1px" borderColor="border.default" bg="bg.surface"
        position="fixed" bottom={0} left={0} right={0} zIndex={10}
        display={{ base: 'flex', md: 'none' }}
      >
        {MOBILE_NAV.map((n) => <TabItem key={n.to} {...n} />)}
        {fab && <AddExpenseFab />}
      </HStack>
      )}
    </Flex>
  )
}
