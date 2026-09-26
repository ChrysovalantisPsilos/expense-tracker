import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keyframes } from '@emotion/react'
import {
  Box, Button, Flex, HStack, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Text,
  usePrefersReducedMotion,
} from '@chakra-ui/react'
import { ArrowRight } from 'lucide-react'
import Eyebrow from '../../shared/ui/Eyebrow.jsx'
import LooseRing from '../../shared/ui/LooseRing.jsx'
import { SHORT_LANDSCAPE } from '../../shared/lib/shortLandscape.js'
import { releaseDay, releaseText, ringVariant } from './whatsNewMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A horizontal swipe this long (px), and more sideways than up/down, turns the page.
const SWIPE = 50
const slideIn = (dx) => keyframes`
  from { opacity: 0; transform: translateX(${dx}px) }
  to { opacity: 1; transform: none }
`
const FROM_RIGHT = slideIn(28)
const FROM_LEFT = slideIn(-28)

// A phone held sideways (~390px tall) gets a wider centred card with the
// picture beside the words: the progress bar across the top, then the
// picture on the left, and the counter, the page and the buttons on the
// right. Should a page still not fit, the card scrolls, so Next and Skip
// are always reachable.
const SHORT_CARD = {
  [SHORT_LANDSCAPE]: {
    my: 3, mx: 4, maxW: '640px', h: 'auto', maxH: 'calc(100dvh - 24px)',
    borderRadius: '2xl', borderWidth: '1px', pt: 4, pb: 4, overflowY: 'auto',
    display: 'grid', gridTemplateColumns: '170px minmax(0, 1fr)', columnGap: 6,
    gridTemplateRows: 'auto auto 1fr auto', alignContent: 'start',
    gridTemplateAreas: '"bar bar" "art count" "art text" "art buttons"',
  },
}
// Each part's place in that grid.
const area = (name, more) => ({ [SHORT_LANDSCAPE]: { gridArea: name, ...more } })

// Where the page's 1–2 chips float around the ring (LooseRing's ring sits a
// little below the middle of its picture): top right, then bottom left.
const CHIP_SPOTS = [
  { top: '36%', left: '58%' },
  { top: '77%', right: '52%' },
]

// On a phone held sideways the picture is small, so the chips line up under
// the ring instead of floating over its edges.
const CHIP_BELOW = { [SHORT_LANDSCAPE]: { position: 'static', fontSize: 'xs', mt: 2, mx: 'auto', maxW: 'full', whiteSpace: 'normal' } }

function Chip({ children, spot }) {
  return (
    <Box position="absolute" {...spot} w="max-content" whiteSpace="nowrap" px={3} py={1.5} borderRadius="full"
      bg="bg.surface" borderWidth="1px" borderColor="border.default" boxShadow="soft"
      fontSize={{ base: 'xs', md: 'sm' }} fontWeight="700" color="text.primary" sx={CHIP_BELOW}>
      {children}
    </Box>
  )
}

// The brand ring with the page's chips. Decorative: the title and body say it all.
function Illustration({ page }) {
  return (
    <Box position="relative" w="full" maxW="320px" aria-hidden="true">
      <LooseRing variant={ringVariant(page)} w="full" h="auto" />
      {(page.chips ?? []).slice(0, CHIP_SPOTS.length).map((chip, i) => (
        <Chip key={chip} spot={CHIP_SPOTS[i]}>{chip}</Chip>
      ))}
    </Box>
  )
}

// "What's new" as a story: one change per page, full screen on a phone and a
// centred card on wider screens. A segmented bar shows progress; Next (Done
// on the last page) and Skip, swipes, arrow keys, and Escape to skip. A
// page's `action` opens that page of the app and closes the story. Pass
// `release` to open it (null closes); `onClose` runs on Skip, Done, Escape
// or an action. Focus moves to Next and returns on close (Chakra's Modal);
// the page counter is a live region, so a page turn is announced. The words
// come from the whatsnew dictionary (releaseText), in the app's language.
export default function WhatsNewStory({ release: shown, onClose }) {
  const t = useT('whatsnew')
  const release = releaseText(shown, t)
  const navigate = useNavigate()
  const reduceMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [forward, setForward] = useState(true)
  const nextRef = useRef(null)
  const touch = useRef(null)

  useEffect(() => { setIndex(0) }, [shown])

  const pages = release?.pages ?? []
  const page = pages[Math.min(index, pages.length - 1)]
  if (!release || !page) return null
  const last = index >= pages.length - 1

  function go(delta) {
    const to = Math.max(0, Math.min(pages.length - 1, index + delta))
    if (to === index) return
    setForward(delta > 0)
    setIndex(to)
  }
  function next() {
    if (last) onClose()
    else go(1)
  }
  function openAction() {
    onClose()
    navigate(page.action.to)
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
  }
  function onTouchStart(e) {
    const p = e.touches[0]
    touch.current = { x: p.clientX, y: p.clientY }
  }
  function onTouchEnd(e) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const p = e.changedTouches[0]
    const dx = p.clientX - start.x
    const dy = p.clientY - start.y
    if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }

  // No slide under reduced motion.
  const animate = {
    '@media (prefers-reduced-motion: no-preference)': { animation: `${forward ? FROM_RIGHT : FROM_LEFT} .28s ease-out both` },
  }

  return (
    <Modal isOpen onClose={onClose} isCentered initialFocusRef={nextRef}
      motionPreset={reduceMotion ? 'none' : 'scale'} blockScrollOnMount>
      <ModalOverlay />
      <ModalContent onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        my={{ base: 0, md: 'auto' }} mx={{ base: 0, md: 4 }} w="full"
        maxW={{ base: '100vw', md: '420px' }}
        h={{ base: '100dvh', md: '700px' }} maxH={{ base: '100dvh', md: 'calc(100dvh - 64px)' }}
        borderRadius={{ base: 0, md: '2xl' }} borderWidth={{ base: 0, md: '1px' }}
        pt={{ base: 'calc(20px + env(safe-area-inset-top, 0px))', md: 6 }}
        pb={{ base: 'calc(20px + env(safe-area-inset-bottom, 0px))', md: 6 }}
        px={6} display="flex" flexDirection="column" overflow="hidden" sx={SHORT_CARD}>
        <HStack spacing={1.5} aria-hidden="true" sx={area('bar', { mb: 3 })}>
          {pages.map((p, i) => (
            <Box key={p.id} flex="1" h="4px" borderRadius="full"
              bg={i <= index ? 'brand.500' : 'border.default'} transition="background .2s" />
          ))}
        </HStack>

        {/* The picture and the words slide in on a page turn; the counter
            between them stays put, so its live region announces the turn. */}
        <Flex key={`art-${index}`} flex="1" minH={0} align="center" justify="center" py={4}
          sx={{ ...animate, ...area('art', { py: 0, alignSelf: 'center' }) }}>
          <Illustration page={page} />
        </Flex>
        <Eyebrow aria-live="polite" aria-atomic="true" sx={area('count')}>
          {t('story.counter', { page: index + 1, pages: pages.length, day: releaseDay(release.date) })}
        </Eyebrow>
        <Box key={`text-${index}`} sx={{ ...animate, ...area('text') }}>
          <ModalHeader as="h2" p={0} mt={1.5} fontSize="2xl" lineHeight="1.25">{page.title}</ModalHeader>
          <ModalBody p={0} mt={2}>
            <Text color="text.muted" lineHeight="1.55">{page.body}</Text>
            {page.action && (
              <Button variant="outline" size="sm" mt={4} rightIcon={<ArrowRight size={16} />}
                onClick={openAction}>
                {page.action.label}
              </Button>
            )}
          </ModalBody>
        </Box>

        <HStack spacing={3} mt={6} sx={area('buttons', { mt: 4 })}>
          <Button variant="ghost" color="text.primary" onClick={onClose} px={5}>{t('story.skip')}</Button>
          <Button ref={nextRef} flex="1" onClick={next}>{last ? t('story.done') : t('story.next')}</Button>
        </HStack>
      </ModalContent>
    </Modal>
  )
}
