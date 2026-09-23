import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Button, Heading, HStack, Portal, Text, VisuallyHidden,
  useBreakpointValue, usePrefersReducedMotion,
} from '@chakra-ui/react'
import {
  fullyVisible, indexAfterMissing, moveStep, placePopover, spotlightRect, stepsFor,
} from './spotlightMath.js'

// How long a step waits for its target (a lazy page and its first render)
// before the tour skips it.
const FIND_TIMEOUT_MS = 4000
const DIM = 'rgba(20, 17, 13, 0.62)'
const RING = '#e9705d' // brand.300: clear on the dimmed page in both modes
const Z = 1500 // above modals (1400), below toasts (1700)

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

// The first element marked data-tour="<name>" that's actually rendered (the
// mobile and desktop navs carry the same names; one is display:none).
function findTarget(name) {
  const all = document.querySelectorAll(`[data-tour="${name}"]`)
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

function waitForTarget(name, isCancelled) {
  return new Promise((resolve) => {
    const start = performance.now()
    const look = () => {
      if (isCancelled()) return resolve(null)
      const el = findTarget(name)
      if (el || performance.now() - start > FIND_TIMEOUT_MS) return resolve(el)
      requestAnimationFrame(look)
    }
    look()
  })
}

// A guided tour: dims the page, cuts a hole around one real element at a
// time and explains it in a small popover (step x of N, Back / Next / Skip).
// `steps`: [{ id, target?, title, body, media?, prefer? }] (spotlightMath's
// stepsFor and placePopover).
// `onStep(step)` runs (and is awaited) before a step looks for its target —
// e.g. to change route. `onClose('done' | 'skip')` ends it; the parent
// unmounts the Spotlight. Esc skips, ←/→ step, Tab stays inside the popover;
// focus goes back where it was (or to `returnFocus`, a selector) afterwards.
export default function Spotlight({ steps, onStep, onClose, returnFocus, label = 'App tour' }) {
  const desktop = useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false
  const reduce = usePrefersReducedMotion()
  const [missing, setMissing] = useState(() => new Set())
  const [index, setIndex] = useState(0)
  const dir = useRef(1)
  const visible = useMemo(() => stepsFor(steps, { desktop, missing }), [steps, desktop, missing])
  const i = Math.min(index, visible.length - 1)
  const step = visible[i]

  // The resolved target for the current step: { id, el } (el null = centred).
  const [found, setFound] = useState(null)
  const ready = found?.id === step?.id
  const [rect, setRect] = useState(null)
  const [vp, setVp] = useState(viewport)
  const [size, setSize] = useState(null)
  const [pop, setPop] = useState(null) // the popover node (it mounts inside a Portal)
  const nextRef = useRef(null)
  const titleId = useId()
  const bodyId = useId()

  const onStepRef = useRef(onStep)
  onStepRef.current = onStep
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Find (and if needed reveal) the current step's target; skip it if it
  // never shows up.
  useEffect(() => {
    if (!step) return undefined
    let cancelled = false
    ;(async () => {
      try { await onStepRef.current?.(step) } catch { /* the target search decides */ }
      if (cancelled) return
      const el = step.target ? await waitForTarget(step.target, () => cancelled) : null
      if (cancelled) return
      if (step.target && !el) {
        const at = indexAfterMissing(i, dir.current, visible.length - 1)
        if (at == null) { onCloseRef.current('done'); return }
        setMissing((m) => new Set(m).add(step.id))
        setIndex(at)
        return
      }
      if (el && !fullyVisible(el.getBoundingClientRect(), viewport())) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
      }
      setFound({ id: step.id, el })
    })()
    return () => { cancelled = true }
    // Re-run per step (and when the viewport swaps the step list), not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, step?.target, desktop])

  // Follow the target while it scrolls, resizes or animates into place.
  const el = found?.el
  useEffect(() => {
    let raf
    let last = ''
    const tick = () => {
      const v = viewport()
      const r = el?.isConnected ? el.getBoundingClientRect() : null
      const key = r ? `${r.top}|${r.left}|${r.width}|${r.height}|${v.width}|${v.height}` : `x|${v.width}|${v.height}`
      if (key !== last) {
        last = key
        setVp(v)
        setRect(r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [el])

  // Measure the popover (its height changes with the copy) before placing it.
  useLayoutEffect(() => {
    if (!pop) return undefined
    const measure = () => setSize((s) => (s && s.width === pop.offsetWidth && s.height === pop.offsetHeight
      ? s : { width: pop.offsetWidth, height: pop.offsetHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(pop)
    return () => ro.disconnect()
  }, [pop])

  useEffect(() => {
    const before = document.activeElement
    return () => {
      if (before?.isConnected && before !== document.body) { before.focus({ preventScroll: true }); return }
      if (!returnFocus) return
      // The parent may be changing route as it closes us: wait for the page.
      const start = performance.now()
      const look = () => {
        const node = document.querySelector(returnFocus)
        if (node) node.focus({ preventScroll: true })
        else if (performance.now() - start < 2000) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    }
  }, [returnFocus])

  const count = visible.length
  const isLast = i === count - 1
  const next = useCallback(() => {
    dir.current = 1
    const n = moveStep(i, 1, count)
    if (n == null) onCloseRef.current('done')
    else setIndex(n)
  }, [i, count])
  const back = useCallback(() => {
    dir.current = -1
    setIndex(moveStep(i, -1, count))
  }, [i, count])

  // Keyboard: Esc skips, arrows step, Tab cycles within the popover.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current('skip'); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return }
      if (e.key !== 'Tab' || !pop) return
      const focusable = [...pop.querySelectorAll('button:not([disabled])')]
      if (focusable.length === 0) return
      const first = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      const inside = pop.contains(document.activeElement)
      if (!inside || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (e.shiftKey ? lastEl : first).focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, back, pop])

  // The hole stays on the previous target until the next one is found (no flash).
  const hole = rect ? spotlightRect(rect, vp) : null
  const place = size ? placePopover({ target: hole, size, viewport: vp, prefer: step?.prefer }) : null
  const shown = Boolean(step && ready && place && (!step.target || hole))

  // Focus moves into the popover once each step is on screen (a hidden
  // element can't take focus).
  useEffect(() => { if (shown) nextRef.current?.focus({ preventScroll: true }) }, [shown, step?.id])

  if (!step) return null
  const motion = reduce ? 'none' : 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease'

  return (
    <Portal>
      {/* Click shield over the whole page; clicks bring focus back to the tour. */}
      <Box position="fixed" inset={0} zIndex={Z} onClick={() => nextRef.current?.focus()}
        bg={hole ? 'transparent' : DIM} transition={reduce ? 'none' : 'background 0.2s'} />
      {hole && (
        <Box position="fixed" zIndex={Z} pointerEvents="none" borderRadius="xl"
          top={`${hole.top}px`} left={`${hole.left}px`} w={`${hole.width}px`} h={`${hole.height}px`}
          boxShadow={`0 0 0 3px ${RING}, 0 0 0 9999px ${DIM}`} transition={motion} />
      )}
      <Box ref={setPop} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        position="fixed" zIndex={Z + 1} w="min(340px, calc(100vw - 24px))"
        top={place ? `${place.top}px` : 0} left={place ? `${place.left}px` : 0}
        visibility={shown ? 'visible' : 'hidden'}
        bg="bg.surface" color="text.primary" borderWidth="1px" borderColor="border.default"
        borderRadius="2xl" boxShadow="lifted" p={4}
        transition={reduce ? 'none' : 'top 0.25s ease, left 0.25s ease'}>
        <Text fontSize="xs" fontWeight="700" color="accent.fg" textTransform="uppercase" letterSpacing="0.08em">
          <VisuallyHidden>{label}: </VisuallyHidden>Step {i + 1} of {count}
        </Text>
        <Heading id={titleId} as="h2" size="sm" mt={1}>{step.title}</Heading>
        <Text id={bodyId} fontSize="sm" color="text.muted" mt={1.5}>{step.body}</Text>
        <HStack mt={4} spacing={2}>
          {!isLast && (
            <Button size="sm" variant="ghost" onClick={() => onCloseRef.current('skip')}>Skip</Button>
          )}
          <Box flex="1" />
          {i > 0 && <Button size="sm" variant="ghost" onClick={back}>Back</Button>}
          <Button ref={nextRef} size="sm" onClick={next}>{isLast ? 'Done' : 'Next'}</Button>
        </HStack>
      </Box>
      <VisuallyHidden aria-live="polite">{shown ? `Step ${i + 1} of ${count}: ${step.title}` : ''}</VisuallyHidden>
    </Portal>
  )
}
