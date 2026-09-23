import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { monthRange } from '../../shared/lib/dates.js'
import { categoryLink } from '../transactions/ledgerLinks.js'
import { budgetPercent } from './budgetMath.js'

// One budget from useBudgetProgress as a kit ProgressRow: category icon,
// "€312.40 of €400.00", the percent (or an Over budget pill) and a bar in
// the budgetTone colour. Shared by the Budgets page (which passes edit/delete
// `actions`) and the Home card. The row drills down to this month's expenses
// in the category (the spend it measures).
export default function BudgetRow({ item, currency, actions }) {
  const link = categoryLink(item.name, item.categoryId, { ...monthRange(), label: 'This month' })
  return (
    <ProgressRow role="listitem" media={<CategoryBadge category={item.category} size={32} />}
      to={link.to} linkLabel={link.label}
      title={item.name}
      meta={`${formatMoney(item.spent, currency)} of ${formatMoney(item.limit, currency)}`}
      percent={budgetPercent(item.spent, item.limit)} tone={item.tone}
      over={item.tone === 'negative'} actions={actions} />
  )
}
