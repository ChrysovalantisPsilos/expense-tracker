import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { budgetPercent } from './budgetMath.js'

// One budget from useBudgetProgress as a kit ProgressRow: category icon,
// "€312.40 of €400.00", the percent (or an Over budget pill) and a bar in
// the budgetTone colour. Shared by the Budgets page and the Home card.
export default function BudgetRow({ item, currency }) {
  return (
    <ProgressRow role="listitem" media={<CategoryBadge category={item.category} size={32} />}
      title={item.name}
      meta={`${formatMoney(item.spent, currency)} of ${formatMoney(item.limit, currency)}`}
      percent={budgetPercent(item.spent, item.limit)} tone={item.tone}
      over={item.tone === 'negative'} />
  )
}
