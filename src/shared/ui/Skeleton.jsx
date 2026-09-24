import { Box, HStack, Stack, VisuallyHidden } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { LOADING_LABEL } from './ringLoader.js'
import { useLoaderReveal } from './useLoaderReveal.js'

// Skeleton screens (idea C): soft sand shapes where a page's cards, rows and
// figures will be, with a warm shimmer sweeping across. Pages compose these
// primitives into their own layout inside a SkeletonRegion, which holds the
// space at once but shows only after the reveal delay (loaderTiming.js), so a
// fast answer never flashes a skeleton. Reduced motion: no shimmer, no fade.

const shimmer = keyframes`
  from { background-position: 100% 0 }
  to { background-position: -150% 0 }
`
const fadeIn = keyframes`
  from { opacity: 0 }
  to { opacity: 1 }
`
const MOTION = '@media (prefers-reduced-motion: no-preference)'
const SHIMMER = {
  [MOTION]: {
    backgroundImage: 'linear-gradient(90deg, var(--chakra-colors-bg-subtle) 0%, var(--chakra-colors-skeleton-shine) 45%, var(--chakra-colors-bg-subtle) 90%)',
    backgroundSize: '250% 100%',
    animation: `${shimmer} 1.4s linear infinite`,
  },
}

// One shimmering shape. Text lines are pills; pass `radius` for tiles.
export function SkeletonBlock({ w = 'full', h = '12px', radius = 'full', ...props }) {
  return <Box w={w} h={h} borderRadius={radius} flexShrink={0} bg="bg.subtle" sx={SHIMMER} {...props} />
}

// Wraps a page's skeleton: one "Loading…" status for screen readers, the
// shapes hidden from them.
export function SkeletonRegion({ label = LOADING_LABEL, children, ...props }) {
  const { shown } = useLoaderReveal()
  return (
    <Box role="status" aria-busy="true" visibility={shown ? 'visible' : 'hidden'}
      sx={shown ? { [MOTION]: { animation: `${fadeIn} .25s ease-out` } } : undefined} {...props}>
      {shown && <VisuallyHidden>{label}</VisuallyHidden>}
      <Box aria-hidden="true">{children}</Box>
    </Box>
  )
}

// Varied widths so a list reads as rows of real text, not a grid.
const TITLE = ['55%', '42%', '63%', '48%', '58%']
const META = ['34%', '26%', '38%', '30%', '22%']
const AMOUNT = ['52px', '44px', '60px', '48px', '40px']
const at = (list, i) => list[i % list.length]

// ItemRow's shape: icon tile · title over a meta line · amount.
function SkeletonRow({ index = 0, amount = true, py = 2 }) {
  return (
    <HStack spacing={3} py={py}>
      <SkeletonBlock w="32px" h="32px" radius="lg" />
      <Stack spacing={1.5} flex="1" minW={0}>
        <SkeletonBlock w={at(TITLE, index)} h="12px" />
        <SkeletonBlock w={at(META, index)} h="10px" />
      </Stack>
      {amount && <SkeletonBlock w={at(AMOUNT, index)} h="14px" />}
    </HStack>
  )
}

// ProgressRow's shape: icon, title and meta, value, and the bar under them.
export function SkeletonProgressRow({ index = 0 }) {
  return (
    <Box>
      <HStack spacing={3} mb={2}>
        <SkeletonBlock w="32px" h="32px" radius="lg" />
        <Stack spacing={1.5} flex="1" minW={0}>
          <SkeletonBlock w={at(TITLE, index)} h="12px" />
          <SkeletonBlock w={at(META, index)} h="10px" />
        </Stack>
        <SkeletonBlock w="32px" h="14px" />
      </HStack>
      <SkeletonBlock h="8px" />
    </Box>
  )
}

// `count` rows of one shape. `progress` for budget/goal rows.
export function SkeletonRows({ count = 4, progress = false, spacing, ...rowProps }) {
  const Row = progress ? SkeletonProgressRow : SkeletonRow
  return (
    <Stack spacing={spacing ?? (progress ? 4 : 0)}>
      {Array.from({ length: count }, (_, i) => <Row key={i} index={i} {...rowProps} />)}
    </Stack>
  )
}

// Figure's shape: a small label over a big number, sized like Figure's.
const VALUE_H = { sm: '14px', md: '18px', lg: '24px', xl: '32px', hero: { base: '32px', lg: '48px' } }
export function SkeletonFigure({ size = 'md', w = '45%', ...props }) {
  return (
    <Stack spacing={2} minW={0} {...props}>
      <SkeletonBlock w="64px" h="10px" />
      <SkeletonBlock w={w} maxW="220px" h={VALUE_H[size]} radius="lg" />
    </Stack>
  )
}
