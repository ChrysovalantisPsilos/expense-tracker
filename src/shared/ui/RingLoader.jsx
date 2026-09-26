import { cloneElement, createElement } from 'react'
import { Box, Center, HStack, Text } from '@chakra-ui/react'
import { markTree, screenTree } from './ringLoader.js'
import { useLoaderReveal, useRingPhase } from './useLoaderReveal.js'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// The loading ring in the app (idea A). Drawn from ringLoader.js's element
// trees and styled by its stylesheet, which index.html carries (vite.config.js
// puts it there), so the full-screen loader is the pre-JavaScript one, exactly.
// Each loader waits LOADER_DELAY_MS before it shows (loaderTiming.js).

const propName = (k) => (k === 'class' ? 'className'
  : k.startsWith('aria-') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))

function toReact(node) {
  if (typeof node === 'string') return node
  const [tag, attrs, children = []] = node
  const props = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [propName(k), v]))
  return createElement(tag, props, ...children.map(toReact))
}

// In-page ring sizes: a page's content area, or `compact` inside a card.
const INLINE = { size: 40, minH: '136px' }
const COMPACT = { size: 24, minH: '64px' }

// The mark alone, animated; decorative (aria-hidden). `mono` draws it in the
// text colour.
export function RingMark({ size = INLINE.size, mono = false }) {
  return toReact(markTree(size, { mono }))
}

// A Button's `spinner`: the ring in the button's text colour.
export function RingSpinner() {
  return <RingMark size="1.15em" mono />
}

function RingScreen({ continued, caption }) {
  const t = useT()
  const phase = useRingPhase(continued)
  return cloneElement(toReact(screenTree({ caption, label: t('loading') })), { style: { '--rl-phase': `${phase}ms` } })
}

// A page-level loader: centred in the content area, or `fullScreen` (the mark
// over the wordmark, before the app shell exists: sign-in check, public
// pages, lazy routes). `caption` puts a short line under a full-screen one;
// `compact` is a smaller one for inside a card.
export default function RingLoader({ fullScreen = false, caption, compact = false }) {
  const { shown, continued } = useLoaderReveal()
  const t = useT()
  if (fullScreen) return shown ? <RingScreen continued={continued} caption={caption} /> : <Box minH="100dvh" />
  const { size, minH } = compact ? COMPACT : INLINE
  return (
    <Center minH={minH}>
      {shown && (
        <Box role="status">
          <RingMark size={size} />
          <span className="rl-sr">{t('loading')}</span>
        </Box>
      )}
    </Center>
  )
}

// A longer wait the user started (a statement, an export, an import): the
// small ring and a short friendly line ("Preparing your statement…"). Shows
// after the reveal delay; the region is a live status for screen readers.
export function BusyNote({ children, ...props }) {
  const { shown } = useLoaderReveal()
  return (
    <HStack role="status" spacing={2.5} color="text.muted" fontSize="sm" {...props}>
      {shown && (
        <>
          <RingMark size={20} />
          <Text minW={0} overflowWrap="anywhere">{children}</Text>
        </>
      )}
    </HStack>
  )
}
