import { forwardRef } from 'react'
import { IconButton, useColorMode } from '@chakra-ui/react'
import { Moon, Sun } from 'lucide-react'
import { useAppearance } from '../lib/appearance.jsx'

// Quick light/dark flip: pins the opposite of what's showing, writing through
// the appearance pref so the choice persists and Settings' Light/Dark/System
// control stays in sync. Forwards its ref so it can sit inside a Tooltip.
const ThemeToggle = forwardRef(function ThemeToggle(props, ref) {
  const { colorMode } = useColorMode()
  const { setPref } = useAppearance()
  const dark = colorMode === 'dark'
  const Icon = dark ? Sun : Moon
  return (
    <IconButton
      ref={ref}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      variant="ghost" size="sm" icon={<Icon size={18} />}
      onClick={() => setPref(dark ? 'light' : 'dark')}
      {...props}
    />
  )
})

export default ThemeToggle
