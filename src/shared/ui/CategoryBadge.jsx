import { categoryIcon } from '../lib/icons.jsx'
import IconTile from './kit/IconTile.jsx'

// A category's Lucide icon on a sand IconTile (income icons in the positive
// tone).
export default function CategoryBadge({ category, size = 40, kind }) {
  return (
    <IconTile icon={categoryIcon(category ?? '')} size={size}
      tone={kind === 'income' ? 'positive' : 'accent'} />
  )
}
