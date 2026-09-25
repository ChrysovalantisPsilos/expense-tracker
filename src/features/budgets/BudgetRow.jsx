import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { formatMoney } from '../../shared/lib/currency.js'
import { categoryLink } from '../categories/categoryLinks.js'
import { budgetPercent } from './budgetMath.js'

const THIS_MONTH = { label: 'This month' }

// One budget from useBudgetProgress as a kit ProgressRow: category icon,
// "€312.40 of €400.00", the percent (or an Over budget pill) and a bar in
// the budgetTone colour. Shared by the Budgets page (which passes edit/delete
// `actions`, as 44px targets) and the Home card. The whole row opens the
// category's page for the row's `period` (default this month): its spend,
// entries and budget editor.
export default function BudgetRow({ item, currency, actions, period = THIS_MONTH }) {
  const link = categoryLink(item.name, item.categoryId, period)
  return (
    <ProgressRow role="listitem" media={<CategoryBadge category={item.category} size={32} />}
      to={link.to} linkLabel={link.label}
      title={item.name}
      meta={`${formatMoney(item.spent, currency)} of ${formatMoney(item.limit, currency)}`}
      percent={budgetPercent(item.spent, item.limit)} tone={item.tone}
      over={item.tone === 'negative'} actions={actions} actionSize="lg" />
  )
}
