import { Box } from '@chakra-ui/react'

// Soft coral radial glow behind public-page hero content. Decorative only:
// the parent must be `position: relative` (and usually clip overflow), and the
// caller places/sizes it with the usual style props (top/right/w/h…). Content
// drawn over it needs `position: relative` so it paints above the glow.
export default function BrandGlow(props) {
  return (
    <Box position="absolute"
      bgGradient="radial(closest-side, brand.100, transparent)"
      _dark={{ bgGradient: 'radial(closest-side, rgba(249, 93, 56, 0.14), transparent)' }}
      pointerEvents="none" aria-hidden {...props} />
  )
}
