import { Component } from 'react'
import { Box, Button, Center, Heading, Stack, Text } from '@chakra-ui/react'

// Last line of defense: without a boundary, any uncaught render/effect error
// unmounts the entire React root — the user gets a silent white page and,
// because AutoUpdate dies with it, can't even pick up a fixed deploy. This
// keeps a friendly recovery screen on screen instead, and AutoUpdate (which
// lives outside the boundary) keeps installing new versions.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[app] crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Center minH="100dvh" px={6}>
        <Stack spacing={4} maxW="420px" textAlign="center" align="center">
          <Heading size="md">Something went wrong</Heading>
          <Text color="text.muted" fontSize="sm">
            Budgeer hit an unexpected error. Reloading usually fixes it — your
            data is safe on the server.
          </Text>
          {this.state.error?.message && (
            <Box as="code" fontSize="xs" color="text.muted" bg="bg.subtle"
              px={3} py={2} borderRadius="lg" maxW="full" overflowX="auto">
              {String(this.state.error.message)}
            </Box>
          )}
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Stack>
      </Center>
    )
  }
}
