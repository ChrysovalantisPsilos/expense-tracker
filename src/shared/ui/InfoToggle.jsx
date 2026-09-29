import { useId, useState } from 'react'
import { Box, IconButton, Text } from '@chakra-ui/react'
import { Info } from 'lucide-react'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// "How is this worked out?" behind an ⓘ: the button sits beside a label and
// the explanation opens in place (never a popup) wherever the card puts
// <InfoBox>. useInfoToggle ties the two together.
export function useInfoToggle() {
  const id = useId()
  const [open, setOpen] = useState(false)
  return { id, open, toggle: () => setOpen((v) => !v) }
}

// `label` names the button for screen readers ("How this is worked out").
// Other props go to the button (e.g. its alignment in a line of text).
export function InfoButton({ info, label, ...props }) {
  return (
    <IconButton size="xs" variant="ghost" color={info.open ? 'accent.fg' : 'text.muted'} icon={<Info size={14} />}
      aria-label={label} aria-expanded={info.open} aria-controls={info.id} onClick={info.toggle} {...props} />
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

// A short line of help with the rest behind its ⓘ: `children` is the line
// (muted small text unless `textProps` say otherwise), `more` the rest,
// opened in place under it (no `more`, no ⓘ). `label` names the ⓘ (default
// "More about this").
export function InfoNote({ children, more, label, textProps, ...props }) {
  const t = useT()
  const info = useInfoToggle()
  return (
    <Box {...props}>
      <Text fontSize="sm" color="text.muted" {...textProps}>
        {children}
        {more && <InfoButton info={info} label={label ?? t('moreInfo')} ml={1} verticalAlign="middle" my="-4px" />}
      </Text>
      {more && <InfoBox info={info}>{more}</InfoBox>}
    </Box>
  )
}
