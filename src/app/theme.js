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

    // Money direction & alerts — warm-leaning green / red / amber, never
    // Chakra's saturated defaults. Each passes 4.5:1 as text on bg.surface
    // and bg.canvas in its mode, so the same token works for figures, icons
    // and progress fills.
    'status.positive': { default: '#2f7a45', _dark: '#86c98a' },
    'status.negative': { default: '#c2372b', _dark: '#f2917f' },
    'status.warning': { default: 'amber.700', _dark: 'amber.400' },

    // Categorical chart series, coral/amber first. The two sand tones swap in
    // dark mode so neither disappears into its background.
    'chart.1': { default: 'brand.500', _dark: 'brand.500' },
    'chart.2': { default: 'amber.400', _dark: 'amber.400' },
    'chart.3': { default: '#ef8a5a', _dark: '#ef8a5a' },
    'chart.4': { default: 'brand.600', _dark: 'brand.600' },
    'chart.5': { default: '#f6c453', _dark: '#f6c453' },
    'chart.6': { default: '#c2703d', _dark: '#c2703d' },
    'chart.7': { default: 'sand.600', _dark: 'sand.400' },
    'chart.8': { default: 'sand.400', _dark: 'sand.600' },

    // Chakra's own global tokens (default borders, dividers, placeholders,
    // subtle fills) are cool grays; re-point them at the sand ramp. These use
    // _light (not default) because that's the key Chakra's base theme sets.
    'chakra-border-color': { _light: 'sand.200', _dark: '#352f26' },
    'chakra-subtle-bg': { _light: 'sand.100', _dark: '#2b271f' },
    'chakra-subtle-text': { _light: 'sand.600', _dark: 'sand.400' },
    'chakra-placeholder-color': { _light: 'sand.500', _dark: 'sand.500' },
  },
}

// Warm outline field shared by every text-entry control. Chakra builds
// Select, Textarea and NumberInput from its *own* Input theme at import time,
// so overriding Input alone wouldn't reach them — each gets this explicitly.
const warmField = {
  borderColor: 'border.default',
  bg: 'bg.surface',
  _hover: { borderColor: 'sand.300', _dark: { borderColor: 'sand.700' } },
}
const fieldDefaults = { focusBorderColor: 'brand.400' }

// Chakra's pop-ups (Modal, Drawer, Popover, Menu, Tooltip, Select options)
// colour themselves through CSS variables with a separate, cool gray `_dark`
// value. Set a variable map for both modes at once.
const bothModes = (vars) => ({ ...vars, _dark: vars })
const surfaceVar = (name) => bothModes({ [`--${name}`]: 'colors.bg.surface' })
const subtleMenuItem = bothModes({ '--menu-bg': 'colors.bg.subtle' })
const popupTitle = { fontFamily: 'heading', fontWeight: '700', letterSpacing: '-0.01em' }

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
    // Focus ring for every focusable control (Chakra's default is blue).
    outline: '0 0 0 3px rgba(249, 93, 56, 0.4)',
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
          _active: { bg: 'bg.subtle' },
        },
        // Neutral outline buttons (the unselected half of segmented toggles)
        // get sand borders instead of Chakra's gray.
        outline: ({ colorScheme }) => (colorScheme === 'gray' ? {
          borderColor: 'border.default',
          color: 'text.primary',
          _hover: { bg: 'bg.subtle' },
          _active: { bg: 'bg.subtle' },
        } : {}),
      },
    },
    // Tight tracking reads well on big display type but closes up Poppins'
    // narrow word space at small sizes ("This month" → "Thismonth"), so it is
    // applied per size: none at sm/xs, a touch at md, landing-style from lg.
    Heading: {
      baseStyle: { fontWeight: '700', color: 'text.primary' },
      sizes: {
        md: { letterSpacing: '-0.01em' },
        lg: { letterSpacing: '-0.02em' },
        xl: { letterSpacing: '-0.02em' },
        '2xl': { letterSpacing: '-0.02em' },
        '3xl': { letterSpacing: '-0.03em' },
        '4xl': { letterSpacing: '-0.03em' },
      },
    },
    Input: {
      defaultProps: fieldDefaults,
      variants: {
        outline: {
          field: warmField,
          addon: { bg: 'bg.subtle', borderColor: 'border.default' },
        },
      },
    },
    Select: {
      defaultProps: fieldDefaults,
      // The native option list reads --select-bg (gray.700 in dark by default).
      baseStyle: { field: surfaceVar('select-bg') },
      variants: { outline: { field: warmField } },
    },
    Textarea: {
      defaultProps: fieldDefaults,
      variants: { outline: warmField },
    },
    NumberInput: {
      defaultProps: fieldDefaults,
      variants: { outline: { field: warmField } },
      baseStyle: {
        stepper: bothModes({ '--number-input-border-color': 'colors.border.default' }),
      },
    },
    // Required-field asterisk (Chakra's is saturated red).
    Form: { baseStyle: { requiredIndicator: { color: 'status.negative' } } },
    Checkbox: {
      defaultProps: { colorScheme: 'brand' },
      // Filled with the 500 shade in both modes, like solid buttons (Chakra
      // switches to a pale 200 in dark mode).
      baseStyle: ({ colorScheme: c }) => ({
        control: {
          borderColor: 'sand.300',
          _dark: { borderColor: 'sand.600' },
          _checked: {
            bg: `${c}.500`, borderColor: `${c}.500`, color: 'white',
            _hover: { bg: `${c}.600`, borderColor: `${c}.600` },
          },
        },
      }),
    },
    Radio: { defaultProps: { colorScheme: 'brand' } },
    Switch: {
      defaultProps: { colorScheme: 'brand' },
      baseStyle: ({ colorScheme: c }) => ({
        track: {
          '--switch-bg': 'colors.sand.300',
          _dark: { '--switch-bg': 'colors.sand.700' },
          _checked: bothModes({ '--switch-bg': `colors.${c}.500` }),
        },
      }),
    },
    // Sand track, rounded fill. Tone comes from the variant: the default fill
    // is the colorScheme's 500 shade; `positive` / `warning` / `negative`
    // use the matching status token (goal reached, near cap, over cap).
    Progress: {
      defaultProps: { colorScheme: 'brand' },
      baseStyle: ({ colorScheme: c }) => ({
        track: { bg: 'bg.subtle', borderRadius: 'full' },
        filledTrack: { bgColor: `${c}.500`, borderRadius: 'full' },
      }),
      variants: {
        positive: { filledTrack: { bgColor: 'status.positive' } },
        warning: { filledTrack: { bgColor: 'status.warning' } },
        negative: { filledTrack: { bgColor: 'status.negative' } },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          ...bothModes({ '--modal-bg': 'colors.bg.surface', '--modal-shadow': 'shadows.lifted' }),
          borderRadius: '2xl',
          borderWidth: '1px',
          borderColor: 'border.default',
        },
        header: { ...popupTitle, fontSize: 'lg' },
      },
    },
    Drawer: {
      baseStyle: {
        dialog: { ...surfaceVar('drawer-bg'), borderColor: 'border.default' },
        header: { ...popupTitle, fontSize: 'lg' },
      },
    },
    Popover: {
      baseStyle: {
        content: {
          ...bothModes({
            '--popper-bg': 'colors.bg.surface',
            '--popper-arrow-shadow-color': 'colors.border.default',
          }),
          borderColor: 'border.default',
          borderRadius: 'xl',
          boxShadow: 'lifted',
        },
        header: { ...popupTitle, borderColor: 'border.default' },
        footer: { borderColor: 'border.default' },
      },
    },
    Menu: {
      baseStyle: {
        list: {
          ...bothModes({ '--menu-bg': 'colors.bg.surface', '--menu-shadow': 'shadows.lifted' }),
          borderColor: 'border.default',
          borderRadius: 'xl',
        },
        item: {
          _focus: subtleMenuItem,
          _active: subtleMenuItem,
          _expanded: subtleMenuItem,
        },
        groupTitle: popupTitle,
      },
    },
    Tooltip: {
      baseStyle: {
        ...bothModes({ '--tooltip-bg': 'colors.bg.surface', '--tooltip-fg': 'colors.text.primary' }),
        borderWidth: '1px',
        borderColor: 'border.default',
        borderRadius: 'md',
        boxShadow: 'soft',
      },
    },
  },
})

export default theme
