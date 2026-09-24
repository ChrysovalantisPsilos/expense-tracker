import { Component } from 'react'
import ErrorScreen from '../shared/ui/ErrorScreen.jsx'
import { errorVariant } from '../shared/ui/errorScreens.js'

// Without a boundary, any uncaught render/effect error unmounts the entire
// React root — the user gets a silent white page and, because AutoUpdate
// dies with it, can't even pick up a fixed deploy. This keeps a friendly
// recovery screen on screen instead (AutoUpdate lives outside it and keeps
// installing new versions). Which screen depends on the error: a page chunk
// that failed to load after a deploy gets "new version", anything while the
// browser is offline gets "offline", the rest the crash screen (errorScreens.js).
// The technical message stays out of sight: it goes to the console only.
//
// Props: `inline` renders inside the app shell's content column (the route
// boundary around its <Outlet>); `resetKey` clears the error when it changes
// (the pathname, so moving to another page tries again); `fallback` (an element)
// replaces the screen entirely (the last-resort boundary outside Chakra).
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

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    const variant = errorVariant(error, typeof navigator === 'undefined' ? undefined : navigator.onLine)
    return (
      <ErrorScreen variant={variant} fullPage={!this.props.inline} />
    )
  }
}
