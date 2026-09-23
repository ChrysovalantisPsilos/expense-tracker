import { Stack } from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import Panel from '../../shared/ui/kit/Panel.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { usePlayback } from '../../shared/ui/kit/motion.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { DEMO_CURRENCY, budgetsDemo } from './landingDemo.js'

const BUDGETS = budgetsDemo()
const money = (minor) => formatMoney(minor, DEMO_CURRENCY)

// Monthly budgets whose progress bars fill when scrolled into view.
export default function BudgetsMock() {
  const playback = usePlayback({ once: true })
  return (
    <Panel ref={playback.ref} title="September budgets"
      label="Example monthly budgets: progress bars per category, with Food & Dining over budget and Groceries nearly at its cap.">
      <Stack spacing={4}>
        {BUDGETS.map((b, i) => (
          <ProgressRow key={b.category} media={<CategoryBadge category={b.category} size={32} />}
            title={b.category} meta={`${money(b.spentMinor)} of ${money(b.capMinor)}`}
            percent={b.pct} tone={b.tone} playback={playback} delay={0.15 * i} />
        ))}
      </Stack>
    </Panel>
  )
}
