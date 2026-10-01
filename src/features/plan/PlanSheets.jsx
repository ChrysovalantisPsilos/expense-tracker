// Plan mode's one sheet: apply the plan to the real rules (a real
// confirmation). Everything else on Plan opens in place (PlanEditors.jsx).
import { useState } from 'react'
import {
  Box, Button, Checkbox, Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerOverlay, HStack, Text,
} from '@chakra-ui/react'
import { AlertTriangle } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { textColor } from '../../shared/ui/kit/kitMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { applySheetParts, badgeKind } from './planPage.js'
import { PlanOnlyNote } from './PlanParts.jsx'

function Sheet({ children, onClose, label }) {
  return (
    <Drawer isOpen placement="bottom" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent borderTopRadius="2xl" pb="env(safe-area-inset-bottom, 0px)"
        sx={{ maxWidth: '560px !important', marginInline: 'auto' }}
        maxH="92dvh" aria-label={label}>
        <Box w="40px" h="4px" borderRadius="full" bg="border.default" mx="auto" mt={2} flexShrink={0} />
        {children}
      </DrawerContent>
    </Drawer>
  )
}

function SheetHead({ title, sub }) {
  return (
    <Box px={5} pt={3} pb={1}>
      <Text fontFamily="heading" fontWeight="700" fontSize="lg" lineHeight="1.2">{title}</Text>
      {sub && <Text fontSize="xs" color="text.muted">{sub}</Text>}
    </Box>
  )
}

// Pick, then confirm: every change ticked; the warning shows before the button.
// A derived row's change (the salary, savings from entries) isn't a recurring
// payment: it's left out, with a note, and stays in the plan. The figure
// after applying is what's left over, or the payments when there's no
// recurring income.
export function ApplySheet({ sum, currency, busy, onApply, onClose }) {
  const t = useT('plan')
  const [off, setOff] = useState([])
  const parts = applySheetParts(sum, currency, off)
  const byId = new Map(sum.changes.map((c) => [c.id, c]))
  const toggle = (id) => setOff((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  return (
    <Sheet onClose={onClose} label={t('apply.title')}>
      <SheetHead title={t('apply.title')} sub={t('apply.sub')} />
      <DrawerBody px={5} pt={0} pb={2}>
        {parts.rows.map((row) => {
          const it = byId.get(row.id)
          return (
            <Checkbox key={row.id} size="lg" isChecked={row.on} w="full" py={2}
              borderBottomWidth="1px" borderColor="border.default" onChange={() => toggle(row.id)}
              sx={{ '.chakra-checkbox__label': { flex: 1, ml: 3, minW: 0 } }}>
              <HStack spacing={3} w="full">
                <CategoryBadge category={it.category} kind={badgeKind(it.kind)} size={32} />
                <Box flex="1" minW={0}>
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{row.name}</Text>
                  <Text fontSize="xs" color="text.muted">{row.line}</Text>
                </Box>
                <Text fontSize="sm" fontWeight="700" color={textColor(row.amount.tone)} whiteSpace="nowrap">
                  {row.amount.text}
                </Text>
              </HStack>
            </Checkbox>
          )
        })}
        {parts.kept.map((c) => (
          <Box key={c.id} pt={3}><PlanOnlyNote text={c.text} /></Box>
        ))}
      </DrawerBody>
      {/* The net and the warning stay in view above the button, however
          long the list (a phone held sideways scrolls the list instead). */}
      <DrawerFooter px={5} pt={2} pb={3} flexDir="column" gap={1} alignItems="stretch">
        <HStack justify="space-between" flexWrap="wrap" columnGap={3}>
          <Text fontSize="sm" color="text.muted">{parts.after.label}</Text>
          <Text fontSize="sm" fontWeight="700">{parts.after.value}</Text>
        </HStack>
        <HStack role="note" align="start" spacing={2.5} my={2} bg="status.warningSubtle" borderWidth="1px"
          borderColor="status.warningBorder" borderRadius="lg" px={3} py={2.5}>
          <Box color="status.warning" mt="2px" flexShrink={0}><AlertTriangle size={16} /></Box>
          <Box fontSize="xs">
            <Text fontWeight="700">{t('apply.warnTitle')}</Text>
            <Text mt={0.5}>{t('apply.warnBody')}</Text>
          </Box>
        </HStack>
        <Button size="lg" w="full" isDisabled={!parts.picked.length} isLoading={busy}
          onClick={() => onApply(new Set(parts.picked))}>
          {parts.submit}
        </Button>
        <Button w="full" variant="ghost" onClick={onClose}>{t('apply.notNow')}</Button>
      </DrawerFooter>
    </Sheet>
  )
}
