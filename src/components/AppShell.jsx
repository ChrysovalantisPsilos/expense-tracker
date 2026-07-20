import { useEffect, useState } from 'react'
import { Outlet, NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Box, Flex, HStack, VStack, IconButton, Text, Badge, Spacer, Tooltip,
  useColorMode,
} from '@chakra-ui/react'
import UserAvatar from './UserAvatar.jsx'
import {
  LayoutDashboard, ReceiptText, Target, Wallet, FileDown, Users,
  Sun, Moon, LogOut, WifiOff, RefreshCw, Search, Repeat, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useProfile } from '../lib/useProfile.js'
import { initSync, pendingCount, flushQueue } from '../lib/offlineQueue.js'
import Logo from './Logo.jsx'
import NotificationBell from './NotificationBell.jsx'

// Mobile bottom-nav set (kept to 6 for touch targets).
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/income', label: 'Income', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: FileDown },
]
// Extra destinations shown only in the roomier desktop sidebar. On mobile
// they're reached from the header (search) or in-page cards (recurring).
const SIDEBAR_EXTRA = [
  { to: '/insights', label: 'Insights', icon: TrendingUp },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
]

function SideItem({ to, label, icon: Icon, end }) {
  return (
    <RouterNavLink to={to} end={end} style={{ width: '100%' }}>
      {({ isActive }) => (
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
    </RouterNavLink>
  )
}

function TabItem({ to, label, icon: Icon, end }) {
  return (
    <RouterNavLink to={to} end={end}>
      {({ isActive }) => (
        <VStack spacing={0.5} px={2} py={1} minW="60px"
          color={isActive ? 'accent.fg' : 'text.muted'}>
          <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
          <Text fontSize="10px" fontWeight={isActive ? '600' : '500'}>{label}</Text>
        </VStack>
      )}
    </RouterNavLink>
  )
}

function SyncBadges() {
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    initSync()
    const refresh = () => pendingCount().then(setPending)
    refresh()
    const on = () => { setOnline(true); flushQueue().then(refresh) }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const t = setInterval(refresh, 5000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(t)
    }
  }, [])
  return (
    <HStack spacing={2}>
      {!online && (
        <Badge colorScheme="orange" display="flex" alignItems="center" gap={1}>
          <WifiOff size={12} /> Offline
        </Badge>
      )}
      {pending > 0 && (
        <Badge colorScheme="purple" display="flex" alignItems="center" gap={1}>
          <RefreshCw size={12} /> {pending}
        </Badge>
      )}
    </HStack>
  )
}

export default function AppShell() {
  const { colorMode, toggleColorMode } = useColorMode()
  const { signOut } = useAuth()
  const { profile } = useProfile()
  const location = useLocation()
  const navigate = useNavigate()
  const [, setTick] = useState(0)
  useEffect(() => { setTick((n) => n + 1) }, [location])
  const ThemeIcon = colorMode === 'dark' ? Sun : Moon

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
        {NAV.map((n) => <SideItem key={n.to} {...n} />)}
        {SIDEBAR_EXTRA.map((n) => <SideItem key={n.to} {...n} />)}
        <Spacer />
        <RouterNavLink to="/profile" style={{ width: '100%' }}>
          {({ isActive }) => (
            <HStack spacing={3} px={3} py={2} borderRadius="lg" w="full" mb={1}
              bg={isActive ? 'bg.subtle' : 'transparent'} _hover={{ bg: 'bg.subtle' }}>
              <UserAvatar size="xs" name={profile?.display_name}
                src={profile?.avatar_url} highlight />
              <Text fontSize="sm" fontWeight="500" noOfLines={1}>
                {profile?.display_name || 'Profile'}
              </Text>
            </HStack>
          )}
        </RouterNavLink>
        <HStack px={1} justify="space-between">
          <Tooltip label="Toggle theme">
            <IconButton aria-label="Toggle theme" variant="ghost" size="sm"
              icon={<ThemeIcon size={18} />} onClick={toggleColorMode} />
          </Tooltip>
          <Tooltip label="Sign out">
            <IconButton aria-label="Sign out" variant="ghost" size="sm"
              icon={<LogOut size={18} />} onClick={signOut} />
          </Tooltip>
        </HStack>
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
          <SyncBadges />
          <IconButton aria-label="Search" variant="ghost" size="sm"
            icon={<Search size={18} />} onClick={() => navigate('/search')} />
          <NotificationBell />
          <IconButton aria-label="Toggle theme" variant="ghost" size="sm"
            icon={<ThemeIcon size={18} />} onClick={toggleColorMode} />
          <RouterNavLink to="/profile">
            <UserAvatar size="sm" name={profile?.display_name}
              src={profile?.avatar_url} highlight />
          </RouterNavLink>
        </Flex>

        {/* Desktop header strip (sync badges + notifications) */}
        <Flex display={{ base: 'none', md: 'flex' }} justify="flex-end" align="center"
          gap={2} px={6} pt={4}>
          <SyncBadges />
          <Tooltip label="Search transactions">
            <IconButton aria-label="Search" variant="ghost" size="sm"
              icon={<Search size={18} />} onClick={() => navigate('/search')} />
          </Tooltip>
          <NotificationBell />
        </Flex>

        <Box as="main" flex="1" px={{ base: 4, md: 6 }} py={{ base: 4, md: 4 }}
          pb={{ base: '92px', md: 8 }} maxW="900px" w="full" mx="auto">
          <Outlet />
        </Box>
      </Flex>

      {/* Mobile bottom nav */}
      <HStack
        as="nav" spacing={0} justify="space-around" px={2} py={1.5}
        borderTopWidth="1px" borderColor="border.default" bg="bg.surface"
        position="fixed" bottom={0} left={0} right={0} zIndex={10}
        display={{ base: 'flex', md: 'none' }}
      >
        {NAV.map((n) => <TabItem key={n.to} {...n} />)}
      </HStack>
    </Flex>
  )
}
