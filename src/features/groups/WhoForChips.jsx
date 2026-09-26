import { useEffect, useId, useRef, useState } from 'react'
import { Box, Flex, Text, useRadio, useRadioGroup } from '@chakra-ui/react'
import { User } from 'lucide-react'
import { ONE_LINE } from '../../shared/lib/shortLandscape.js'
import GroupMark from './GroupMark.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// "Just me" as a radio value (a radio can't hold null).
const ME = 'me'
const FADE = '28px'

// Which edges of a sideways-scrolling row have more chips past them.
function edges(row) {
  const max = row.scrollWidth - row.clientWidth
  return { start: row.scrollLeft > 1, end: row.scrollLeft < max - 1 }
}

// "Who's it for?" on the Add expense form: "Just me" (a personal expense),
// then the viewer's groups (`groups`, most recently used first). One radio
// group — arrow keys move between chips — on one line that scrolls sideways
// when the chips don't fit, faded at an edge with more past it. `value` is
// the chosen group's id, or null for Just me; `onChange` gets the same.
// Choosing a chip swaps the form under the row, which mounts a new row:
// `memory` (a ref the page keeps) carries the row's scroll position and,
// after a pick, the keyboard focus across that swap. The page renders it
// only when the viewer has at least one group.
export default function WhoForChips({ groups, value, onChange, memory }) {
  const t = useT('groups')
  const labelId = useId()
  const rowRef = useRef(null)
  const [fade, setFade] = useState({ start: false, end: false })
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: `who-for-${labelId}`,
    value: value ?? ME,
    onChange: (v) => {
      if (memory) memory.current.focus = true
      onChange(v === ME ? null : v)
    },
  })

  // Back where the last row was scrolled, then the chosen chip in view; the
  // focus back on it after a pick. Then the fades follow the scroll and size.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    const mem = memory?.current
    if (mem) row.scrollLeft = mem.scrollLeft ?? 0
    const input = row.querySelector('input:checked')
    const chip = input?.closest('label')
    if (chip) {
      const pad = 32
      if (chip.offsetLeft < row.scrollLeft) row.scrollLeft = chip.offsetLeft - pad
      else if (chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = chip.offsetLeft + chip.offsetWidth - row.clientWidth + pad
      }
    }
    if (mem?.focus) {
      mem.focus = false
      input?.focus({ preventScroll: true })
    }
    const measure = () => {
      if (mem) mem.scrollLeft = row.scrollLeft
      setFade((f) => {
        const next = edges(row)
        return next.start === f.start && next.end === f.end ? f : next
      })
    }
    measure()
    row.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    ro?.observe(row)
    return () => {
      row.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
    // Once per row: a pick mounts a new one (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mask = `linear-gradient(to right, ${fade.start ? 'transparent' : 'black'}, black ${FADE}, black calc(100% - ${FADE}), ${fade.end ? 'transparent' : 'black'})`
  return (
    <Box>
      <Text id={labelId} fontWeight="500" mb={2}>{t('whoFor.label')}</Text>
      <Flex {...getRootProps({}, rowRef)} aria-labelledby={labelId} position="relative" gap={2}
        overflowX="auto" mx={-1} px={1} py={1}
        sx={{
          scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          maskImage: mask, WebkitMaskImage: mask,
        }}>
        <Chip {...getRadioProps({ value: ME })} label={t('whoFor.justMe')} icon={(
          <Flex boxSize="28px" borderRadius="full" bg="bg.subtle" color="text.muted" align="center"
            justify="center" flexShrink={0}>
            <User size={15} />
          </Flex>
        )} />
        {groups.map((g) => (
          <Chip key={g.id} {...getRadioProps({ value: g.id })} label={g.name}
            icon={<GroupMark name={g.name} src={g.image_url} size={28} />} />
        ))}
      </Flex>
    </Box>
  )
}

function Chip({ label, icon, ...radioProps }) {
  const { getInputProps, getRadioProps } = useRadio(radioProps)
  return (
    <Box as="label" flexShrink={0}>
      <input {...getInputProps()} />
      <Flex {...getRadioProps()} title={label} align="center" gap={2} minH="44px" maxW="220px" pl={1.5} pr={4}
        borderWidth="1px" borderColor="border.default" borderRadius="full" bg="bg.surface" cursor="pointer"
        fontSize="sm" fontWeight="500" transition="background 0.15s, border-color 0.15s" _hover={{ bg: 'bg.subtle' }}
        _checked={{
          bg: 'accent.solid', borderColor: 'accent.solid', color: 'white', fontWeight: 700,
          _hover: { bg: 'accent.solidHover' },
          '& > :first-child': { boxShadow: '0 0 0 2px white' },
        }}
        sx={{ '&[data-focus-visible]': { boxShadow: 'outline' } }}>
        {icon}
        <Text as="span" sx={ONE_LINE}>{label}</Text>
      </Flex>
    </Box>
  )
}
