import { IconButton } from '@chakra-ui/react'
import { ArrowLeft } from 'lucide-react'
import useGoBack from './useGoBack.js'

// A page header's ← button (PageHeader's `leading`): back to wherever the
// user came from in the app, or to `fallback` when the page was opened
// directly (see useGoBack). 44×44 target.
export default function BackButton({ fallback = '/', label = 'Back', isDisabled }) {
  const back = useGoBack(fallback)
  return (
    <IconButton aria-label={label} variant="ghost" boxSize="44px" minW="44px" ml={-3}
      flexShrink={0} icon={<ArrowLeft size={20} />} onClick={back} isDisabled={isDisabled} />
  )
}
