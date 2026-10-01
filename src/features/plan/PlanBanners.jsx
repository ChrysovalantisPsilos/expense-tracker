// Plan mode's notices: the last apply (with Undo for 24 hours, then a quiet
// note), the undo and clear-plan confirmations, and "Your recurring changed since you planned".
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, HStack, Text } from '@chakra-ui/react'
import { Check, RotateCcw } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import IconTile from '../../shared/ui/kit/IconTile.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.jsx'

// Just applied (planPage.appliedParts): what happened (the net a month now,
// or the payments a month when there's no recurring income), Undo, and
// until when.
export function AppliedBanner({ parts, onUndo }) {
  const t = useT('plan')
  return (
    <Panel p={4} borderColor="status.positive" role="status">
      <HStack align="start" spacing={3}>
        <IconTile icon={Check} size={40} radius="xl" tone="positive" bg="status.positiveSubtle" />
        <Box flex="1" minW={0}>
          <Text fontFamily="heading" fontWeight="700" fontSize="md">{parts.title}</Text>
          <Text fontSize="sm" color="text.muted">{parts.body}</Text>
          <HStack mt={2} spacing={2} flexWrap="wrap">
            <Button size="sm" variant="outline" onClick={onUndo}>{t('applied.undo')}</Button>
            <Button as={RouterLink} to="/recurring" size="sm" variant="ghost">{t('applied.view')}</Button>
          </HStack>
          <Text fontSize="xs" color="text.muted" mt={2}>{parts.until}</Text>
        </Box>
      </HStack>
    </Panel>
  )
}

// After the 24 hours: "Applied yesterday · 4 changes · View in Recurring".
export function AppliedNote({ parts }) {
  const t = useT('plan')
  return (
    <HStack spacing={1.5} fontSize="xs" color="text.muted" flexWrap="wrap" mt={-2}>
      <Check size={14} />
      <Text>{parts.note}</Text>
      <Text aria-hidden>·</Text>
      <Button as={RouterLink} to="/recurring" variant="link" size="xs" color="accent.fg">{t('applied.viewIn')}</Button>
    </HStack>
  )
}

export function UndoDialog({ count, busy, onUndo, onClose }) {
  const t = useT('plan')
  return (
    <ConfirmDialog isOpen onClose={onClose} onConfirm={onUndo} busy={busy}
      title={t('undo.title', { count })} cancelLabel={t('undo.keep')} confirmLabel={t('undo.confirm')}>
      <Text color="text.muted" fontSize="sm">{t('undo.body')}</Text>
      <Text fontSize="sm" mt={3}>{t('undo.entries')}</Text>
    </ConfirmDialog>
  )
}

// "Clear plan": empties the plan (changes and added payments). The real
// recurring payments are untouched.
export function ClearDialog({ onClear, onClose }) {
  const t = useT('plan')
  return (
    <ConfirmDialog isOpen onClose={onClose} onConfirm={onClear} danger
      title={t('clear.title')} cancelLabel={t('clear.keep')} confirmLabel={t('clear.confirm')}>
      <Text color="text.muted" fontSize="sm">{t('clear.body')}</Text>
    </ConfirmDialog>
  )
}

// The real rules moved under the plan (planPage.realityParts): changed ones
// are marked on their rows, and deleted or stopped ones left the plan. OK
// takes the news on board (planMath.acknowledge).
export function RealityBanner({ parts, onOk }) {
  const t = useT('plan')
  return (
    <Panel p={4} bg="status.warningSubtle" borderColor="status.warningBorder" elevation="soft" role="status">
      <HStack align="start" spacing={3}>
        <Box color="status.warning" mt="2px" flexShrink={0}><RotateCcw size={18} /></Box>
        <Box flex="1" minW={0}>
          <Text fontWeight="700" fontSize="sm">{t('reality.title')}</Text>
          <Text fontSize="xs" mt={0.5}>{t('reality.lead')}</Text>
          <Box as="ul" pl={4} mt={1.5} fontSize="xs">
            {parts.lines.map((line) => <li key={line.id}>{line.text}</li>)}
          </Box>
        </Box>
        <Button size="sm" variant="ghost" mt={-1} mr={-2} onClick={onOk}>{t('reality.ok')}</Button>
      </HStack>
    </Panel>
  )
}
