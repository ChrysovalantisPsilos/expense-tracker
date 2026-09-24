import { errorScreen } from '../shared/ui/errorScreens.js'
import theme from './theme.js'

// Last resort, for an error in Chakra itself (above the themed boundary):
// plain markup and inline styles, nothing that could fail the same way. It
// follows the OS light/dark scheme through the system colours, so it's never
// a white page and never a blinding one. Same words as the crash screen, and
// likewise no technical message (the error boundary logs it).
const coral = theme.colors.brand[500]
const screen = errorScreen('crash')

export default function RootFallback() {
  return (
    <main style={{
      colorScheme: 'light dark', background: 'Canvas', color: 'CanvasText', minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: '24px 16px', textAlign: 'center', fontFamily: theme.fonts.body,
    }}>
      <img src="/budgeer-mark.svg" alt="" width="72" height="72" />
      <h1 style={{ fontFamily: theme.fonts.heading, fontSize: 24, margin: 0 }}>{screen.title}</h1>
      <p style={{ maxWidth: 420, margin: 0, opacity: 0.8, lineHeight: 1.6 }}>{screen.body}</p>
      <button type="button" onClick={() => window.location.reload()} style={{
        background: coral, color: 'white', border: 0, borderRadius: 12, padding: '12px 24px',
        font: `600 16px ${theme.fonts.body}`, cursor: 'pointer',
      }}>
        {screen.actions[0].label}
      </button>
    </main>
  )
}
