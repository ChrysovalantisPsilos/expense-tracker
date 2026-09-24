import { Link } from '@chakra-ui/react'

// The id every layout gives its one <main>: the skip link's target.
export const MAIN_ID = 'main'

// "Skip to content": the first stop for keyboard users, hidden until focused.
// It moves focus to the page's <main id={MAIN_ID}>, so Tab continues from the
// content rather than the navigation.
export default function SkipLink() {
  function skip(e) {
    const main = document.getElementById(MAIN_ID)
    if (!main) return
    e.preventDefault()
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    main.focus()
  }
  return (
    <Link href={`#${MAIN_ID}`} onClick={skip}
      position="fixed" top={2} left={2} zIndex="skipLink" px={4} py={2} borderRadius="lg"
      bg="bg.surface" color="text.primary" fontWeight="600" boxShadow="lifted"
      transform="translateY(-200%)" _focus={{ transform: 'none', boxShadow: 'outline' }}>
      Skip to content
    </Link>
  )
}
