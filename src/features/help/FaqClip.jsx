import { useEffect, useRef, useState } from 'react'
import { Box, IconButton } from '@chakra-ui/react'
import { useInView } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { clipSources } from './faqMath.js'

// Displayed size of a clip (recorded at phone size, 5:9 portrait). The box
// is sized up front, so nothing shifts when the poster or video loads.
const WIDTH = 240
const RATIO = '5 / 9'

// A short, silent, looping recording of the app for a FAQ answer. Nothing is
// fetched until the answer is open and near the viewport (a closed answer is
// clipped, so it never is): only then does the poster <img> render, and the
// <video> (preload="none") mounts only once it should play. It plays by itself while in view unless the visitor prefers reduced
// motion — then it shows the poster with a play button. A pause/play button
// is always there, and the description is the image's alt and video's label.
export default function FaqClip({ name, alt }) {
  const { ref, reduce, inView } = usePlayback({ amount: 0.6 })
  const near = useInView(ref, { once: true, margin: '200px' })
  // null = follow the automatic behaviour; true/false = the visitor's choice.
  const [choice, setChoice] = useState(null)
  const [started, setStarted] = useState(false)
  const videoRef = useRef(null)
  const { video, mp4, poster } = clipSources(name)
  const playing = inView && (choice ?? !reduce)

  useEffect(() => { if (playing) setStarted(true) }, [playing])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = true // React doesn't always reflect `muted`; autoplay needs it
    if (playing) el.play().catch(() => {})
    else el.pause()
  }, [playing, started])

  return (
    <Box ref={ref} as="figure" position="relative" w="full" maxW={`${WIDTH}px`} sx={{ aspectRatio: RATIO }}
      borderRadius="xl" overflow="hidden" borderWidth="1px" borderColor="border.default" bg="bg.subtle">
      {near && (
        <Box as="img" src={poster} alt={started ? '' : alt} loading="lazy" decoding="async"
          position="absolute" inset={0} w="full" h="full" objectFit="cover" />
      )}
      {started && (
        <Box as="video" ref={videoRef} aria-label={alt} muted loop playsInline preload="none"
          disablePictureInPicture position="absolute" inset={0} w="full" h="full" objectFit="cover">
          <source src={mp4} type="video/mp4" />
          <source src={video} type="video/webm" />
        </Box>
      )}
      <IconButton aria-label={playing ? 'Pause the clip' : 'Play the clip'} size="sm" isRound
        position="absolute" right={2} bottom={2} bg="blackAlpha.600" color="white"
        _hover={{ bg: 'blackAlpha.700' }} _active={{ bg: 'blackAlpha.800' }}
        icon={playing ? <Pause size={16} /> : <Play size={16} />}
        onClick={() => setChoice(!playing)} />
    </Box>
  )
}
