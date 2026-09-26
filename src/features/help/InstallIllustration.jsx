import { Box, Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import {
  BookOpen, ChevronLeft, ChevronRight, Copy, EllipsisVertical, History, House, Lock, Menu,
  MonitorDown, Plus, Share, SquarePlus, Star, Smartphone,
} from 'lucide-react'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// Simplified, generic sketches of each browser's install controls for the
// FAQ's install guide: the button to tap on the left, the menu entry on the
// right, highlighted in coral. Our own drawings — not the browsers' artwork.
// The words are in the `help` namespace under install.<platform>: the
// description, the menu rows (as the browser shows them in that language)
// and the two captions (step1, step2).

const ICON = 14
const SITE = 'www.budgeer.com'
const APP_LINE = `Budgeer · ${SITE}` // the install prompt's app and site

// The control to tap: coral fill, white icon.
function Hit({ icon: Icon, label }) {
  return (
    <Flex align="center" justify="center" gap={1} px={label ? 2 : 0} minW="24px" h="24px"
      borderRadius="md" bg="brand.500" color="white" boxShadow="0 0 0 3px var(--chakra-colors-brand-200)">
      <Icon size={ICON} />
      {label && <Text as="span" fontSize="2xs" fontWeight="700">{label}</Text>}
    </Flex>
  )
}

function Plain({ icon: Icon }) {
  return <Flex boxSize="24px" align="center" justify="center" color="text.muted"><Icon size={ICON} /></Flex>
}

// A few grey lines standing in for the page.
function PageLines({ n = 3 }) {
  return (
    <Stack spacing={1.5} px={2.5} py={2.5} flex="1">
      <Box h="8px" w="55%" borderRadius="full" bg="brand.300" opacity={0.7} />
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} h="6px" w={`${90 - i * 18}%`} borderRadius="full" bg="border.default" />
      ))}
    </Stack>
  )
}

function Address() {
  return (
    <HStack flex="1" minW={0} spacing={1} h="22px" px={2} borderRadius="full" bg="bg.subtle"
      color="text.muted" fontSize="2xs">
      <Lock size={9} />
      <Text as="span" noOfLines={1}>{SITE}</Text>
    </HStack>
  )
}

// A phone (or, `wide`, a browser window) outline.
function Screen({ wide, children }) {
  return (
    <Flex direction="column" w="full" maxW={wide ? '240px' : '150px'} h={wide ? '118px' : '176px'}
      mx="auto" bg="bg.surface" borderWidth="1.5px" borderColor="border.default"
      borderRadius={wide ? 'lg' : '2xl'} overflow="hidden">
      {children}
    </Flex>
  )
}

// A menu or share sheet: plain rows plus the one to tap.
function MenuList({ rows, hit }) {
  return (
    <Stack spacing={0.5} p={1.5} mt="auto" bg="bg.subtle" borderTopRadius="lg">
      {rows.map(([Icon, label]) => (
        <HStack key={label} spacing={2} px={2} h="24px" fontSize="2xs" color="text.muted">
          <Icon size={12} /><Text as="span" noOfLines={1}>{label}</Text>
        </HStack>
      ))}
      <HStack spacing={2} px={2} h="26px" borderRadius="md" bg="brand.500" color="white"
        fontSize="2xs" fontWeight="700" boxShadow="0 0 0 3px var(--chakra-colors-brand-200)">
        <hit.icon size={12} /><Text as="span" noOfLines={1}>{hit.label}</Text>
      </HStack>
    </Stack>
  )
}

// Each sketch's second screen takes `tr`, which reads its platform's words.
const SKETCHES = {
  iphone: {
    first: (
      <Screen>
        <PageLines n={4} />
        <HStack justify="space-between" px={2} py={1.5} borderTopWidth="1px" borderColor="border.default">
          <Plain icon={ChevronLeft} /><Plain icon={ChevronRight} /><Hit icon={Share} />
          <Plain icon={BookOpen} /><Plain icon={Copy} />
        </HStack>
      </Screen>
    ),
    second: (tr) => (
      <Screen>
        <PageLines n={1} />
        <MenuList rows={[[Copy, tr('copy')], [Star, tr('favourites')]]}
          hit={{ icon: SquarePlus, label: tr('addToHome') }} />
      </Screen>
    ),
  },
  android: {
    first: (
      <Screen>
        <HStack spacing={1} px={1.5} py={1.5} borderBottomWidth="1px" borderColor="border.default">
          <Address /><Hit icon={EllipsisVertical} />
        </HStack>
        <PageLines n={5} />
      </Screen>
    ),
    second: (tr) => (
      <Screen>
        <MenuList rows={[[Plus, tr('newTab')], [History, tr('history')]]}
          hit={{ icon: Smartphone, label: tr('installApp') }} />
      </Screen>
    ),
  },
  samsung: {
    first: (
      <Screen>
        <HStack spacing={1} px={1.5} py={1.5} borderBottomWidth="1px" borderColor="border.default">
          <Address />
        </HStack>
        <PageLines n={3} />
        <HStack justify="space-between" px={2} py={1.5} borderTopWidth="1px" borderColor="border.default">
          <Plain icon={ChevronLeft} /><Plain icon={ChevronRight} /><Plain icon={House} />
          <Plain icon={BookOpen} /><Hit icon={Menu} />
        </HStack>
      </Screen>
    ),
    second: (tr) => (
      <Screen>
        <MenuList rows={[[Star, tr('addPageTo')], [BookOpen, tr('bookmarks')]]}
          hit={{ icon: House, label: tr('homeScreen') }} />
      </Screen>
    ),
  },
  desktop: {
    first: (
      <Screen wide>
        <HStack spacing={1.5} px={2} py={1.5} borderBottomWidth="1px" borderColor="border.default">
          <Address /><Hit icon={MonitorDown} />
        </HStack>
        <PageLines n={3} />
      </Screen>
    ),
    second: (tr) => (
      <Screen wide>
        <Stack spacing={2} m="auto" p={3} w="80%" bg="bg.subtle" borderRadius="lg">
          <Text fontSize="2xs" fontWeight="700">{tr('prompt')}</Text>
          <Text fontSize="2xs" color="text.muted">{APP_LINE}</Text>
          <HStack justify="flex-end" spacing={1.5}>
            <Hit icon={MonitorDown} label={tr('install')} />
          </HStack>
        </Stack>
      </Screen>
    ),
  },
}

function Caption({ n, children }) {
  return (
    <Text fontSize="xs" fontWeight="600" color="text.muted" textAlign="center" mt={2}>
      <Box as="span" color="accent.fg">{n}</Box> · {children}
    </Text>
  )
}

// The two-step sketch for one platform ('iphone' | 'android' | 'samsung' | 'desktop').
export default function InstallIllustration({ platform }) {
  const t = useT('help')
  const tr = (key) => t(`install.${platform}.${key}`)
  const sketch = SKETCHES[platform]
  return (
    <Box role="img" aria-label={tr('label')} bg="bg.canvas" borderWidth="1px" borderColor="border.default"
      borderRadius="xl" p={3} maxW="420px">
      <SimpleGrid columns={platform === 'desktop' ? { base: 1, sm: 2 } : 2} spacing={3} aria-hidden>
        <Box>{sketch.first}<Caption n={1}>{tr('step1')}</Caption></Box>
        <Box>{sketch.second(tr)}<Caption n={2}>{tr('step2')}</Caption></Box>
      </SimpleGrid>
    </Box>
  )
}
