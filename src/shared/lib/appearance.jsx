import { createContext, useContext, useEffect, useState } from 'react'
import { useColorMode } from '@chakra-ui/react'

// Appearance preference: 'light' | 'dark' | 'system'. Persisted locally and
// applied to Chakra's colour mode. 'system' follows the OS live (and updates
// when the OS flips). This is the single source of truth for colour mode, so
// the theme sets useSystemColorMode:false and lets this drive setColorMode.

const APPEARANCE_KEY = 'budge-appearance'
const Ctx = createContext({ pref: 'system', setPref: () => {} })

export function AppearanceProvider({ children }) {
  const { setColorMode } = useColorMode()
  const [pref, setPref] = useState(() => localStorage.getItem(APPEARANCE_KEY) || 'system')

  useEffect(() => {
    localStorage.setItem(APPEARANCE_KEY, pref)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setColorMode(pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref)
    apply()
    if (pref === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [pref, setColorMode])

  return <Ctx.Provider value={{ pref, setPref }}>{children}</Ctx.Provider>
}

export const useAppearance = () => useContext(Ctx)
