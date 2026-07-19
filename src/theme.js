import { extendTheme } from '@chakra-ui/react'

// Clean & minimal, light + dark. One accent, generous whitespace, Inter.
const config = {
  initialColorMode: 'system',
  useSystemColorMode: true,
}

const theme = extendTheme({
  config,
  fonts: {
    heading: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    body: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  colors: {
    // Single accent ramp (indigo). Swap here to rebrand the whole app.
    brand: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
    },
  },
  styles: {
    global: (props) => ({
      body: {
        bg: props.colorMode === 'dark' ? 'gray.900' : 'gray.50',
        color: props.colorMode === 'dark' ? 'gray.100' : 'gray.800',
      },
    }),
  },
  components: {
    Card: {
      baseStyle: (props) => ({
        container: {
          bg: props.colorMode === 'dark' ? 'gray.800' : 'white',
          borderRadius: 'xl',
          borderWidth: '1px',
          borderColor: props.colorMode === 'dark' ? 'gray.700' : 'gray.200',
          boxShadow: 'sm',
        },
      }),
    },
    Button: {
      defaultProps: { colorScheme: 'brand' },
    },
  },
})

export default theme
