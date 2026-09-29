// Plan mode's one sheet: apply the plan to the real rules (a real
// confirmation). Everything else on Plan opens in place (PlanEditors.jsx).
import { useState } from 'react'
import {
  Box, Button, Checkbox, Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerOverlay, HStack, Text,
} from '@chakra-ui/react'
import { AlertTriangle } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { formatMoney, formatSigned } from '../../shared/lib/currency.js'
import { signTone, textColor } from '../../shared/ui/kit/kitMath.js'
import { shortDate } from '../../shared/lib/dates.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { applicable, asShown, effectOf, monthOf } from './planMath.js'
import { PlanOnlyNote } from './PlanParts.jsx'
import { itemName, perUnit } from './planText.js'

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

// What Apply will do to one change, in words.
function applyLine(item, t) {
  if (item.added) return t(item.kind === 'income' ? 'apply.newIncome' : 'apply.newCost', { date: shortDate(item.next) })
  if (item.cancelled) return t('apply.stops')
  return t('apply.editLine', { amount: perUnit(item.after), date: shortDate(item.next) })
}

// Pick, then confirm: every change ticked; the warning shows before the button.
// The salary change isn't a recurring payment: it's left out, with a note, and
// stays in the plan. The figure after applying is the net, or the payments
// when there's no recurring income.
export function ApplySheet({ sum, currency, busy, onApply, onClose }) {
  const t = useT('plan')
  const [off, setOff] = useState(() => new Set())
  const list = applicable(sum.changes)
  const salaryKept = sum.changes.some((c) => c.salary)
  const picked = list.filter((c) => !off.has(c.id))
  const effect = picked.reduce((s, it) => s + effectOf(it), 0)
  const toggle = (id) => setOff((s) => {
    const next = new Set(s)
    if (!next.delete(id)) next.add(id)
    return next
  })
  return (
    <Sheet onClose={onClose} label={t('apply.title')}>
      <SheetHead title={t('apply.title')} sub={t('apply.sub')} />
      <DrawerBody px={5} pt={0} pb={2}>
        {list.map((it) => {
          const eff = effectOf(it)
          return (
            <Checkbox key={it.id} size="lg" isChecked={!off.has(it.id)} w="full" py={2}
              borderBottomWidth="1px" borderColor="border.default" onChange={() => toggle(it.id)}
              sx={{ '.chakra-checkbox__label': { flex: 1, ml: 3, minW: 0 } }}>
              <HStack spacing={3} w="full">
                <CategoryBadge category={it.category} kind={it.kind} size={32} />
                <Box flex="1" minW={0}>
                  <Text fontSize="sm" fontWeight="600" noOfLines={1}>{itemName(it)}</Text>
                  <Text fontSize="xs" color="text.muted">{applyLine(it, t)}</Text>
                </Box>
                <Text fontSize="sm" fontWeight="700" color={textColor(signTone(eff))} whiteSpace="nowrap">
                  {t('changes.perMonth', { amount: formatSigned(monthOf(asShown(eff, sum.mode)), currency, { plus: true }) })}
                </Text>
              </HStack>
            </Checkbox>
          )
        })}
        {salaryKept && <Box pt={3}><PlanOnlyNote text={t('apply.salaryNote')} /></Box>}
      </DrawerBody>
      {/* The net and the warning stay in view above the button, however
          long the list (a phone held sideways scrolls the list instead). */}
      <DrawerFooter px={5} pt={2} pb={3} flexDir="column" gap={1} alignItems="stretch">
        <HStack justify="space-between" flexWrap="wrap" columnGap={3}>
          <Text fontSize="sm" color="text.muted">{t(`apply.after.${sum.mode}`)}</Text>
          <Text fontSize="sm" fontWeight="700">
            {t('apply.netValue', { amount: formatMoney(monthOf(asShown(sum.before + effect, sum.mode)), currency) })}
          </Text>
        </HStack>
        <HStack role="note" align="start" spacing={2.5} my={2} bg="status.warningSubtle" borderWidth="1px"
          borderColor="status.warningBorder" borderRadius="lg" px={3} py={2.5}>
          <Box color="status.warning" mt="2px" flexShrink={0}><AlertTriangle size={16} /></Box>
          <Box fontSize="xs">
            <Text fontWeight="700">{t('apply.warnTitle')}</Text>
            <Text mt={0.5}>{t('apply.warnBody')}</Text>
          </Box>
        </HStack>
        <Button size="lg" w="full" isDisabled={!picked.length} isLoading={busy}
          onClick={() => onApply(new Set(picked.map((p) => p.id)))}>
          {t('apply.submit', { count: picked.length })}
        </Button>
        <Button w="full" variant="ghost" onClick={onClose}>{t('apply.notNow')}</Button>
      </DrawerFooter>
    </Sheet>
  )
}
