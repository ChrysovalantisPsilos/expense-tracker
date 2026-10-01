import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import ProgressRow from '../../shared/ui/kit/ProgressRow.jsx'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryLink } from '../../shared/lib/categoryLinks.js'
import { budgetRowParts } from './budgetMath.js'

// One budget from useBudgetProgress as a kit ProgressRow: category icon,
// "€312.40 of €400.00", the percent (or an Over budget pill) and a bar in
// the budgetTone colour. Shared by the Budgets page (which passes edit/delete
// `actions`, as 44px targets) and the Home card. The whole row opens the
// category's page for the row's `period` (default this month): its spend,
// entries and budget editor.
export default function BudgetRow({ item, currency, actions, period }) {
  const t = useT('budgets')
  const link = categoryLink(item.name, item.categoryId, period ?? { label: t('thisMonth') })
  const p = budgetRowParts(item, currency)
  return (
    <ProgressRow role="listitem" media={<CategoryBadge category={item.category} size={32} />}
      to={link.to} linkLabel={link.label}
      title={p.name} meta={p.meta} percent={p.percent} tone={p.tone ?? undefined}
      over={p.over} actions={actions} actionSize="lg" />
  )
}
