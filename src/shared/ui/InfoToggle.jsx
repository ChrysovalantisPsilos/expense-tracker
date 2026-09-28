import { useId, useState } from 'react'
import { Box, IconButton } from '@chakra-ui/react'
import { Info } from 'lucide-react'

// "How is this worked out?" behind an ⓘ: the button sits beside a label and
// the explanation opens in place (never a popup) wherever the card puts
// <InfoBox>. useInfoToggle ties the two together.
export function useInfoToggle() {
  const id = useId()
  const [open, setOpen] = useState(false)
  return { id, open, toggle: () => setOpen((v) => !v) }
}

// `label` names the button for screen readers ("How this is worked out").
export function InfoButton({ info, label }) {
  return (
    <IconButton size="xs" variant="ghost" color={info.open ? 'accent.fg' : 'text.muted'} icon={<Info size={14} />}
      aria-label={label} aria-expanded={info.open} aria-controls={info.id} onClick={info.toggle} />
  )
}

export function InfoBox({ info, children, ...props }) {
  if (!info.open) return null
  return (
    <Box id={info.id} mt={2} bg="bg.subtle" borderRadius="lg" px={3} py={2} fontSize="xs" color="text.muted" {...props}>
      {children}
    </Box>
  )
}
