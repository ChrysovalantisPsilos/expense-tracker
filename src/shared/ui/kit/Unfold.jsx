import { Collapse } from '@chakra-ui/react'

const UNCLIP = { enter: { overflow: 'visible' } }
const CLIP = { overflow: 'hidden' }

// Chakra's Collapse for a block that carries a shadow (a Panel): Collapse
// clips its content, which cuts the Panel's lifted shadow off. Unfold unclips
// once fully open and clips again the moment it starts closing, so the
// height animation still hides the overflow. `in` opens it; other Collapse
// props (animateOpacity…) pass through.
export default function Unfold({ in: open, children, ...props }) {
  return (
    <Collapse in={open} transitionEnd={UNCLIP} style={open ? undefined : CLIP} {...props}>
      {children}
    </Collapse>
  )
}
