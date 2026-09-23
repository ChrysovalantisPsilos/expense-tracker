// Pure maths for the Spotlight tour (Spotlight.jsx): which steps apply, how
// Back/Next move through them, where the cut-out and the popover go.
// Rects are plain { top, left, width, height } in viewport pixels.

// The steps that apply here: a step's `media` ('mobile' | 'desktop', or unset
// for both) must match the viewport, and a step whose target turned out not to
// be on screen (its id in `missing`) drops out, so "step x of N" stays honest.
export function stepsFor(steps, { desktop, missing = new Set() }) {
  return steps.filter((s) => (!s.media || s.media === (desktop ? 'desktop' : 'mobile')) && !missing.has(s.id))
}

// Back (-1) / Next (+1) from `index` over `count` steps: the new index, or
// null when Next leaves the last step (the tour is done). Back stops at 0.
export function moveStep(index, dir, count) {
  const next = index + dir
  if (next >= count) return null
  return Math.max(0, Math.min(next, count - 1))
}

// Where to stand after the step at `index` was found missing: going forward,
// the same index now holds the following step; going back, the one before
// (never below 0). Null when nothing is left.
export function indexAfterMissing(index, dir, remaining) {
  if (remaining <= 0) return null
  const at = dir < 0 ? index - 1 : index
  return Math.max(0, Math.min(at, remaining - 1))
}

const round = (n) => Math.round(n)

// The cut-out: the target grown by `pad` on every side, kept inside the viewport.
export function spotlightRect(target, viewport, pad = 6) {
  const top = Math.max(0, target.top - pad)
  const left = Math.max(0, target.left - pad)
  const bottom = Math.min(viewport.height, target.top + target.height + pad)
  const right = Math.min(viewport.width, target.left + target.width + pad)
  return { top: round(top), left: round(left), width: round(Math.max(0, right - left)), height: round(Math.max(0, bottom - top)) }
}

// Is the target entirely on screen (so there's no need to scroll it into view)?
export function fullyVisible(target, viewport) {
  return target.top >= 0 && target.left >= 0
    && target.top + target.height <= viewport.height
    && target.left + target.width <= viewport.width
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

// Place a popover of `size` { width, height } next to `target` (already the
// cut-out rect) within `viewport`, `gap` px from the target and at least
// `margin` px from the viewport edges. Tries `prefer` in order and takes the
// first side with room; failing that, the side with the most room, clamped
// onto the screen. No target → centred. Returns { placement, top, left }.
export function placePopover({
  target, size, viewport, gap = 12, margin = 12, prefer = ['bottom', 'top', 'right', 'left'],
}) {
  const maxTop = viewport.height - size.height - margin
  const maxLeft = viewport.width - size.width - margin
  if (!target) {
    return {
      placement: 'center',
      top: round(clamp((viewport.height - size.height) / 2, margin, maxTop)),
      left: round(clamp((viewport.width - size.width) / 2, margin, maxLeft)),
    }
  }
  const room = {
    bottom: viewport.height - (target.top + target.height) - gap - margin,
    top: target.top - gap - margin,
    right: viewport.width - (target.left + target.width) - gap - margin,
    left: target.left - gap - margin,
  }
  const need = { bottom: size.height, top: size.height, right: size.width, left: size.width }
  const side = prefer.find((p) => room[p] >= need[p])
    ?? prefer.reduce((best, p) => (room[p] - need[p] > room[best] - need[best] ? p : best), prefer[0])

  const midX = target.left + target.width / 2 - size.width / 2
  const midY = target.top + target.height / 2 - size.height / 2
  let top
  let left
  if (side === 'bottom') { top = target.top + target.height + gap; left = midX }
  else if (side === 'top') { top = target.top - gap - size.height; left = midX }
  else if (side === 'right') { top = midY; left = target.left + target.width + gap }
  else { top = midY; left = target.left - gap - size.width }
  return { placement: side, top: round(clamp(top, margin, maxTop)), left: round(clamp(left, margin, maxLeft)) }
}
