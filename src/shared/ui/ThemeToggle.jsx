import { forwardRef } from 'react'
import { IconButton, useColorMode } from '@chakra-ui/react'
import { Moon, Sun } from 'lucide-react'
import { useAppearance } from '../lib/appearance.jsx'
import { toggledPref } from '../lib/themePref.js'

// Quick light/dark flip: pins the opposite of what's showing, or goes back to
// following the device when the flip lands on what the device shows
// (toggledPref). It writes through the appearance pref so the choice persists
// and Settings' Light/Dark/System control stays in sync. Forwards its ref so it can sit inside a Tooltip —
// which passes its own onClick (to close itself), so ours runs alongside it
// rather than being replaced by it.
const ThemeToggle = forwardRef(function ThemeToggle({ onClick, ...props }, ref) {
  const { colorMode } = useColorMode()
  const { setPref } = useAppearance()
  const dark = colorMode === 'dark'
  const Icon = dark ? Sun : Moon
  return (
    <IconButton
      ref={ref}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      variant="ghost" size="sm" icon={<Icon size={18} />}
      {...props}
      onClick={(e) => {
        onClick?.(e)
        setPref(toggledPref(dark, window.matchMedia('(prefers-color-scheme: dark)').matches))
      }}
    />
  )
})

export default ThemeToggle
