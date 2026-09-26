import { Stack } from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY, budgetsDemo } from './landingDemo.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

const BUDGETS = budgetsDemo()
const money = (minor) => formatMoney(minor, DEMO_CURRENCY)

// Monthly budgets whose progress bars fill when scrolled into view.
export default function BudgetsMock() {
  const t = useT('landing')
  const playback = usePlayback({ once: true })
  return (
    <Panel ref={playback.ref} title={t('demo.budgets.title')} label={t('demo.budgets.label')}>
      <Stack spacing={4}>
        {BUDGETS.map((b, i) => (
          <ProgressRow key={b.id} media={<CategoryBadge category={b.category} size={32} />}
            title={t(`demo.categories.${b.id}`)}
            meta={t('demo.budgets.of', { spent: money(b.spentMinor), cap: money(b.capMinor) })}
            percent={b.pct} tone={b.tone} playback={playback} delay={0.15 * i} />
        ))}
      </Stack>
    </Panel>
  )
}
