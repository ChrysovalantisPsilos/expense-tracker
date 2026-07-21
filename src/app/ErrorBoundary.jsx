import { Component } from 'react'
import { Box, Button, Center, Heading, Stack, Text } from '@chakra-ui/react'

// Last line of defense: without a boundary, any uncaught render/effect error
// unmounts the entire React root — the user gets a silent white page and,
// because ReloadPrompt dies with it, can't even accept a fixed deploy. This
// keeps a friendly recovery screen (and the update prompt, which lives
// outside the boundary) on screen instead.
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
            Budge hit an unexpected error. Reloading usually fixes it — your
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
