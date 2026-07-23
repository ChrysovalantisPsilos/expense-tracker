import { extendTheme } from '@chakra-ui/react'

// Budgeer — warm & playful. Coral accent + amber, warm sand neutrals (never
// cool grays), rounded cards, soft shadows. Light + dark.

// AppearanceProvider (shared/lib/appearance.jsx) is the single source of truth
// for colour mode — it reads the saved Light/Dark/System preference and drives
// setColorMode, following the OS live when 'system'. So Chakra must not also
// track the system on its own (useSystemColorMode:false) or the two fight.
const config = {
  initialColorMode: 'system',
  useSystemColorMode: false,
}

const colors = {
  // Primary accent — coral.
  brand: {
    50: '#fff4f1',
    100: '#ffe3db',
    200: '#ffc5b6',
    300: '#ffa088',
    400: '#ff7a5a',
    500: '#f95d38', // primary
    600: '#e2431f',
    700: '#bd3418',
    800: '#962b17',
    900: '#7a2717',
  },
  // Secondary accent — amber (positive/highlights).
  amber: {
    50: '#fff8eb',
    100: '#feefc7',
    200: '#fddf8a',
    300: '#fcc94d',
    400: '#fbb324',
    500: '#f59e0b',
    600: '#d97a06',
    700: '#b45709',
    800: '#92440e',
    900: '#78390f',
  },
  // Warm neutral ramp (sand) — replaces cool gray everywhere.
  sand: {
    50: '#faf8f4',
    100: '#f3efe7',
    200: '#e8e1d5',
    300: '#d6ccba',
    400: '#b8ab94',
    500: '#9a8b72',
    600: '#7c6f59',
    700: '#5f5545',
    800: '#3d372d',
    900: '#242019',
  },
}

const semanticTokens = {
  colors: {
    'bg.canvas': { default: 'sand.50', _dark: '#1a1714' },
    'bg.surface': { default: 'white', _dark: '#232019' },
    'bg.subtle': { default: 'sand.100', _dark: '#2b271f' },
    'border.default': { default: 'sand.200', _dark: '#352f26' },
    'text.primary': { default: 'sand.900', _dark: '#f6f2ea' },
    'text.muted': { default: 'sand.600', _dark: 'sand.400' },
    'accent.fg': { default: 'brand.600', _dark: 'brand.300' },
  },
}

const theme = extendTheme({
  config,
  colors,
  semanticTokens,
  fonts: {
    heading: `'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    body: `'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  radii: {
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.25rem',
  },
  shadows: {
    soft: '0 1px 2px rgba(36, 32, 25, 0.04), 0 4px 16px rgba(36, 32, 25, 0.06)',
    lifted: '0 2px 4px rgba(36, 32, 25, 0.05), 0 12px 32px rgba(36, 32, 25, 0.10)',
  },
  styles: {
    global: {
      body: {
        bg: 'bg.canvas',
        color: 'text.primary',
        fontFeatureSettings: '"ss01"',
      },
      '*::selection': { bg: 'brand.100' },
    },
  },
  components: {
    Card: {
      baseStyle: {
        container: {
          bg: 'bg.surface',
          borderRadius: '2xl',
          borderWidth: '1px',
          borderColor: 'border.default',
          boxShadow: 'soft',
        },
      },
    },
    Button: {
      baseStyle: { borderRadius: 'lg', fontWeight: '600' },
      defaultProps: { colorScheme: 'brand' },
      variants: {
        solid: {
          bg: 'brand.500',
          color: 'white',
          _hover: { bg: 'brand.600', _disabled: { bg: 'brand.500' } },
          _active: { bg: 'brand.700' },
        },
        ghost: {
          color: 'text.muted',
          _hover: { bg: 'bg.subtle', color: 'text.primary' },
        },
      },
    },
    Heading: { baseStyle: { fontWeight: '700', letterSpacing: '-0.01em' } },
    Input: {
      defaultProps: { focusBorderColor: 'brand.400' },
    },
    Select: {
      defaultProps: { focusBorderColor: 'brand.400' },
    },
  },
})

export default theme
