import { HStack, IconButton, Text, Tooltip } from '@chakra-ui/react'
import { ArrowLeftRight } from 'lucide-react'
import { useSiteSwitch } from '../lib/useSiteSwitch.js'

// Developer-only link to the other Budgeer site (live ⇄ test), keeping the
// current page. A real <a href>, so middle-click / open-in-new-tab work.
// `compact` is the phone top bar's icon button; otherwise a labelled pill for
// the desktop sidebar. Renders nothing for non-developers.
export default function SiteSwitch({ compact = false }) {
  const site = useSiteSwitch()
  if (!site) return null
  if (compact) {
    return (
      <Tooltip label={site.label}>
        <IconButton as="a" href={site.href} aria-label={site.label}
          variant="ghost" size="sm" icon={<ArrowLeftRight size={18} />} />
      </Tooltip>
    )
  }
  return (
    <HStack as="a" href={site.href} spacing={2} px={3} py={2} borderRadius="full"
      borderWidth="1px" borderColor="border.default" color="text.muted"
      _hover={{ bg: 'bg.subtle', color: 'text.primary' }}
      _focusVisible={{ boxShadow: 'outline' }} transition="all 0.15s">
      <ArrowLeftRight size={16} aria-hidden />
      <Text fontSize="sm" fontWeight="600">{site.label}</Text>
    </HStack>
  )
}
