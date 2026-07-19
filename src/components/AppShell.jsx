import { useEffect, useState } from 'react'
import { Outlet, NavLink as RouterNavLink, useLocation } from 'react-router-dom'
import {
  Box, Flex, HStack, IconButton, Text, useColorMode, Badge, Spacer, Button,
} from '@chakra-ui/react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { initSync, pendingCount, flushQueue } from '../lib/offlineQueue.js'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/expenses', label: 'Expenses', icon: '🧾' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/income', label: 'Income', icon: '💰' },
  { to: '/reports', label: 'Reports', icon: '📤' },
]

function NavItem({ to, label, icon, end }) {
  return (
    <RouterNavLink to={to} end={end}>
      {({ isActive }) => (
        <Flex direction="column" align="center" px={3} py={2} borderRadius="lg"
          color={isActive ? 'brand.500' : 'gray.500'}
          bg={isActive ? 'brand.50' : 'transparent'}
          _dark={{ bg: isActive ? 'whiteAlpha.100' : 'transparent' }}
          fontSize="sm" fontWeight={isActive ? 'semibold' : 'normal'} minW="64px">
          <Box fontSize="lg">{icon}</Box>
          {label}
        </Flex>
      )}
    </RouterNavLink>
  )
}

export default function AppShell() {
  const { colorMode, toggleColorMode } = useColorMode()
  const { signOut, user } = useAuth()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const location = useLocation()

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

  // refresh pending indicator on navigation (after logging on a page)
  useEffect(() => { pendingCount().then(setPending) }, [location])

  return (
    <Flex direction="column" minH="100dvh">
      {/* Top bar */}
      <Flex as="header" px={4} py={3} align="center" gap={3}
        borderBottomWidth="1px" position="sticky" top={0} zIndex={10}
        bg="chakra-body-bg" backdropFilter="saturate(180%) blur(8px)">
        <Text fontWeight="bold">Expense Tracker</Text>
        {!online && <Badge colorScheme="orange">Offline</Badge>}
        {pending > 0 && <Badge colorScheme="purple">{pending} unsynced</Badge>}
        <Spacer />
        <IconButton aria-label="Toggle theme" size="sm" variant="ghost"
          onClick={toggleColorMode} icon={<span>{colorMode === 'dark' ? '☀️' : '🌙'}</span>} />
        <Button size="sm" variant="ghost" onClick={signOut}>Sign out</Button>
      </Flex>

      {/* Content */}
      <Box as="main" flex="1" p={4} pb="88px" maxW="container.md" mx="auto" w="full">
        <Outlet />
      </Box>

      {/* Bottom nav (mobile-first, works on desktop too) */}
      <HStack as="nav" spacing={1} justify="space-around" px={2} py={2}
        borderTopWidth="1px" position="fixed" bottom={0} left={0} right={0}
        bg="chakra-body-bg" zIndex={10}>
        {NAV.map((n) => <NavItem key={n.to} {...n} />)}
      </HStack>
    </Flex>
  )
}
