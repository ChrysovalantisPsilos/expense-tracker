import { Box, Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import {
  BookOpen, ChevronLeft, ChevronRight, Copy, EllipsisVertical, History, House, Lock, Menu,
  MonitorDown, Plus, Share, SquarePlus, Star, Smartphone,
} from 'lucide-react'

// Simplified, generic sketches of each browser's install controls for the
// FAQ's install guide: the button to tap on the left, the menu entry on the
// right, highlighted in coral. Our own drawings — not the browsers' artwork.

const ICON = 14

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
      <Text as="span" noOfLines={1}>www.budgeer.com</Text>
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

const SKETCHES = {
  iphone: {
    label: 'Safari on an iPhone: tap the Share button in the bottom toolbar, then Add to Home Screen in the list that opens.',
    first: (
      <Screen>
        <PageLines n={4} />
        <HStack justify="space-between" px={2} py={1.5} borderTopWidth="1px" borderColor="border.default">
          <Plain icon={ChevronLeft} /><Plain icon={ChevronRight} /><Hit icon={Share} />
          <Plain icon={BookOpen} /><Plain icon={Copy} />
        </HStack>
      </Screen>
    ),
    second: (
      <Screen>
        <PageLines n={1} />
        <MenuList rows={[[Copy, 'Copy'], [Star, 'Add to Favourites']]}
          hit={{ icon: SquarePlus, label: 'Add to Home Screen' }} />
      </Screen>
    ),
  },
  android: {
    label: 'Chrome on Android: tap the three-dot menu at the top right, then Install app.',
    first: (
      <Screen>
        <HStack spacing={1} px={1.5} py={1.5} borderBottomWidth="1px" borderColor="border.default">
          <Address /><Hit icon={EllipsisVertical} />
        </HStack>
        <PageLines n={5} />
      </Screen>
    ),
    second: (
      <Screen>
        <MenuList rows={[[Plus, 'New tab'], [History, 'History']]}
          hit={{ icon: Smartphone, label: 'Install app' }} />
      </Screen>
    ),
  },
  samsung: {
    label: 'Samsung Internet: tap the menu at the bottom right, then Add page to, Home screen.',
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
    second: (
      <Screen>
        <MenuList rows={[[Star, 'Add page to'], [BookOpen, 'Bookmarks']]}
          hit={{ icon: House, label: 'Home screen' }} />
      </Screen>
    ),
  },
  desktop: {
    label: 'Chrome or Edge on a computer: click the install icon at the right of the address bar, then Install.',
    first: (
      <Screen wide>
        <HStack spacing={1.5} px={2} py={1.5} borderBottomWidth="1px" borderColor="border.default">
          <Address /><Hit icon={MonitorDown} />
        </HStack>
        <PageLines n={3} />
      </Screen>
    ),
    second: (
      <Screen wide>
        <Stack spacing={2} m="auto" p={3} w="80%" bg="bg.subtle" borderRadius="lg">
          <Text fontSize="2xs" fontWeight="700">Install app?</Text>
          <Text fontSize="2xs" color="text.muted">Budgeer · www.budgeer.com</Text>
          <HStack justify="flex-end" spacing={1.5}>
            <Hit icon={MonitorDown} label="Install" />
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

const CAPTIONS = {
  iphone: ['Tap Share', 'Add to Home Screen'],
  android: ['Tap ⋮', 'Install app'],
  samsung: ['Tap the menu', 'Add page to → Home screen'],
  desktop: ['Click the install icon', 'Install'],
}

// The two-step sketch for one platform ('iphone' | 'android' | 'samsung' | 'desktop').
export default function InstallIllustration({ platform }) {
  const sketch = SKETCHES[platform]
  const [a, b] = CAPTIONS[platform]
  return (
    <Box role="img" aria-label={sketch.label} bg="bg.canvas" borderWidth="1px" borderColor="border.default"
      borderRadius="xl" p={3} maxW="420px">
      <SimpleGrid columns={platform === 'desktop' ? { base: 1, sm: 2 } : 2} spacing={3} aria-hidden>
        <Box>{sketch.first}<Caption n={1}>{a}</Caption></Box>
        <Box>{sketch.second}<Caption n={2}>{b}</Caption></Box>
      </SimpleGrid>
    </Box>
  )
}
