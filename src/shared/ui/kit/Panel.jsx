import { forwardRef } from 'react'
import { Box } from '@chakra-ui/react'
import CardHeader from '../CardHeader.jsx'
import { landscapeOnly } from '../../lib/shortLandscape.js'

const SHADOW = { lifted: 'lifted', soft: 'soft', none: 'none' }
const PADDING = { base: 4, md: 5 }
// Sideways, the default padding stays at the phone's 16px (the screen is
// md-wide, but a card there is half or less of it).
const SHORT_PADDING = landscapeOnly({ p: 4 })

// The white rounded card every screen is built from. The header (optional)
// is CardHeader: `title` (an h2), `eyebrow` above it, `icon` tile (its tone
// via `iconTone`, e.g. 'negative' for a danger card), muted `subtitle`, and
// an `action` on the right; `divider` rules the header off from a list of
// rows below it. `elevation` picks the shadow:
// 'lifted' (default, the landing look), 'soft' or 'none' (a card nested in
// another surface). Pass `label` to make the card a decorative illustration:
// it becomes one role="img" with that label and its contents are hidden from
// assistive tech (the landing demos). `p` replaces the default padding
// (then px/py refine it), on a phone held sideways too. Forwards its ref (e.g. usePlayback's).
const Panel = forwardRef(function Panel(
  { title, eyebrow, icon, iconTone, subtitle, action, divider, elevation = 'lifted', label, p = PADDING, children, ...props }, ref,
) {
  const header = (title || eyebrow) && (
    <CardHeader title={title} eyebrow={eyebrow} icon={icon} iconTone={iconTone} subtitle={subtitle} action={action} divider={divider} />
  )
  const a11y = label ? { role: 'img', 'aria-label': label } : {}
  return (
    <Box ref={ref} bg="bg.surface" borderWidth="1px" borderColor="border.default" borderRadius="2xl"
      boxShadow={SHADOW[elevation]} p={p} sx={p === PADDING ? SHORT_PADDING : undefined} {...a11y} {...props}>
      {label ? <Box aria-hidden>{header}{children}</Box> : <>{header}{children}</>}
    </Box>
  )
})

export default Panel
