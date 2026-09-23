import { IconButton } from '@chakra-ui/react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// A page header's ← button (PageHeader's `leading`): back to wherever the
// user came from in the app, or to `fallback` when the page was opened
// directly (a shared link, a reload in a fresh tab — nothing in-app to go
// back to). React Router numbers its history entries (`idx`), so idx 0 is
// the first page of this visit. 44×44 target.
export default function BackButton({ fallback = '/', label = 'Back' }) {
  const navigate = useNavigate()
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback))
  return (
    <IconButton aria-label={label} variant="ghost" boxSize="44px" minW="44px" ml={-3}
      flexShrink={0} icon={<ArrowLeft size={20} />} onClick={back} />
  )
}
