// Home's Meal vouchers card: what's on the card and the next top-up, opening
// the Meal vouchers page. Only for users who set vouchers up.
import { Link as RouterLink } from 'react-router-dom'
import { Flex, IconButton } from '@chakra-ui/react'
import { ChevronRight, Ticket } from 'lucide-react'
import Panel from '../../shared/ui/kit/Panel.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { useMealVouchers, useVoucherCard } from './vouchers.js'
import { NextTopUp } from './VoucherParts.jsx'
import { voucherCardParts } from './voucherText.js'

export default function VoucherCard() {
  const { settings } = useMealVouchers()
  return settings ? <CardBody settings={settings} /> : null
}

function CardBody({ settings }) {
  const t = useT('vouchers')
  const { card } = useVoucherCard(settings)
  const parts = voucherCardParts(settings, card.summary, card.next)
  return (
    <Panel icon={Ticket} title={t('title')} action={
      <IconButton as={RouterLink} to="/vouchers" size="sm" variant="ghost" aria-label={t('open')}
        icon={<ChevronRight size={18} />} />
    }>
      <Flex align="end" justify="space-between" gap={3} flexWrap="wrap" mt={1}>
        <Figure label={t('balance')} size="lg" tone={parts.tone} value={parts.balance} />
        <NextTopUp settings={settings} next={card.next} align="right" />
      </Flex>
    </Panel>
  )
}
