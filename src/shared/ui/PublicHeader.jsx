import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Container, Flex } from '@chakra-ui/react'
import Logo from './Logo.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

// Sticky, translucent top bar for the logged-out pages (landing, auth, invite
// preview): logo linking home, theme toggle, then page-specific actions as
// `children`. Gains a hairline border once the page scrolls under it.
export default function PublicHeader({ children }) {
  const scrolled = useScrolled()
  return (
    <Box as="header" position="sticky" top={0} zIndex="sticky"
      bg="color-mix(in srgb, var(--chakra-colors-bg-canvas) 85%, transparent)"
      backdropFilter="saturate(1.4) blur(12px)"
      borderBottomWidth="1px" borderColor={scrolled ? 'border.default' : 'transparent'}
      transition="border-color 0.2s">
      <Container maxW="6xl" px={{ base: 4, md: 6 }}>
        <Flex h="60px" align="center" gap={{ base: 1, sm: 2 }}>
          <Logo as={RouterLink} to="/" aria-label="Budgeer home" size={28} layerStyle="hitArea"
            borderRadius="md" _focusVisible={{ boxShadow: 'outline', outline: 'none' }} />
          <Box flex="1" />
          <ThemeToggle />
          {children}
        </Flex>
      </Container>
    </Box>
  )
}
