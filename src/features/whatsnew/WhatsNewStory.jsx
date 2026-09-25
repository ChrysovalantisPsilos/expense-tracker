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
import { releaseDay, ringVariant } from './whatsNewMath.js'

// A horizontal swipe this long (px), and more sideways than up/down, turns the page.
const SWIPE = 50
const slideIn = (dx) => keyframes`
  from { opacity: 0; transform: translateX(${dx}px) }
  to { opacity: 1; transform: none }
`
const FROM_RIGHT = slideIn(28)
const FROM_LEFT = slideIn(-28)

// Where the page's 1–2 chips float around the ring (LooseRing's ring sits a
// little below the middle of its picture): top right, then bottom left.
const CHIP_SPOTS = [
  { top: '36%', left: '58%' },
  { top: '77%', right: '52%' },
]

function Chip({ children, spot }) {
  return (
    <Box position="absolute" {...spot} w="max-content" whiteSpace="nowrap" px={3} py={1.5} borderRadius="full"
      bg="bg.surface" borderWidth="1px" borderColor="border.default" boxShadow="soft"
      fontSize={{ base: 'xs', md: 'sm' }} fontWeight="700" color="text.primary">
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
// the page counter is a live region, so a page turn is announced.
export default function WhatsNewStory({ release, onClose }) {
  const navigate = useNavigate()
  const reduceMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [forward, setForward] = useState(true)
  const nextRef = useRef(null)
  const touch = useRef(null)

  useEffect(() => { setIndex(0) }, [release])

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
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
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
        px={6} display="flex" flexDirection="column" overflow="hidden">
        <HStack spacing={1.5} aria-hidden="true">
          {pages.map((p, i) => (
            <Box key={p.title} flex="1" h="4px" borderRadius="full"
              bg={i <= index ? 'brand.500' : 'border.default'} transition="background .2s" />
          ))}
        </HStack>

        {/* The picture and the words slide in on a page turn; the counter
            between them stays put, so its live region announces the turn. */}
        <Flex key={`art-${index}`} flex="1" minH={0} align="center" justify="center" py={4} sx={animate}>
          <Illustration page={page} />
        </Flex>
        <Eyebrow aria-live="polite" aria-atomic="true">
          New · {index + 1} of {pages.length} · {releaseDay(release.date)}
        </Eyebrow>
        <Box key={`text-${index}`} sx={animate}>
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

        <HStack spacing={3} mt={6}>
          <Button variant="ghost" color="text.primary" onClick={onClose} px={5}>Skip</Button>
          <Button ref={nextRef} flex="1" onClick={next}>{last ? 'Done' : 'Next'}</Button>
        </HStack>
      </ModalContent>
    </Modal>
  )
}
