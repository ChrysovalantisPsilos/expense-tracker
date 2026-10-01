import { categoryIcon } from '../lib/icons.jsx'
import { categoryLook } from '../lib/categoryStyle.js'
import IconTile from './kit/IconTile.jsx'

// A category's Lucide icon on a sand IconTile (income icons in the positive
// tone), or on a tile tinted with the colour the user picked for it
// (categoryLook, which the native app's badge follows too).
export default function CategoryBadge({ category, size = 40, kind }) {
  const { tone, tint } = categoryLook(category, kind)
  return (
    <IconTile icon={categoryIcon(category ?? '')} size={size} tone={tone}
      {...(tint ? { bg: tint.bg, color: tint.fg } : {})} />
  )
}
