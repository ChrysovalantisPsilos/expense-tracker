import { categoryIcon } from '../lib/icons.jsx'
import { categoryTile } from '../lib/categoryStyle.js'
import IconTile from './kit/IconTile.jsx'

// A category's Lucide icon on a sand IconTile (income icons in the positive
// tone), or on a tile tinted with the colour the user picked for it.
export default function CategoryBadge({ category, size = 40, kind }) {
  const tint = categoryTile(category?.color)
  return (
    <IconTile icon={categoryIcon(category ?? '')} size={size}
      tone={kind === 'income' ? 'positive' : 'accent'}
      {...(tint ? { bg: tint.bg, color: tint.fg } : {})} />
  )
}
