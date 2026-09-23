// Pure logic behind the Help & FAQ page: search filtering, #anchor handling
// and which accordion items are open. No React, no DOM.

// Lowercase, accent-free and with typographic quotes flattened, so "Don't",
// "don’t" and "DON'T" all match, and "cafe" finds "café".
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function searchTerms(query) {
  const q = normalizeText(query)
  return q ? q.split(' ') : []
}

// Everything a question can be found by: its question, answer, steps and
// the description of its clip.
function itemText(item) {
  return [item.q, ...item.a, ...(item.steps ?? []), item.media?.alt ?? ''].join(' ')
}

// The sections whose questions match `query`: every word of the query must
// appear somewhere in the question, its answer (steps and clip description
// included) or its section's title. Empty sections are dropped; an empty
// query returns `sections` unchanged.
export function filterFaq(sections, query) {
  const terms = searchTerms(query)
  if (terms.length === 0) return sections
  return sections
    .map((section) => {
      const title = normalizeText(section.title)
      const items = section.items.filter((item) => {
        const hay = `${title} ${normalizeText(itemText(item))}`
        return terms.every((t) => hay.includes(t))
      })
      return { ...section, items }
    })
    .filter((section) => section.items.length > 0)
}

export function countItems(sections) {
  return sections.reduce((n, s) => n + s.items.length, 0)
}

const ANCHOR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// The question id a location hash points at ("#bank-import" → "bank-import"),
// or null when the hash is empty, malformed or names no question.
export function anchorFromHash(hash, sections) {
  let id = String(hash ?? '').replace(/^#/, '')
  try { id = decodeURIComponent(id) } catch { return null }
  if (!ANCHOR.test(id)) return null
  return sections.some((s) => s.items.some((i) => i.id === id)) ? id : null
}

// Chakra's Accordion `index` for a section: the positions of its open items.
export function openIndexes(items, openIds) {
  return items.flatMap((item, i) => (openIds.has(item.id) ? [i] : []))
}

// The new set of open ids after a section's Accordion reports `indexes` as
// open: that section's items follow `indexes`, other sections are untouched.
export function applyOpenIndexes(openIds, items, indexes) {
  const next = new Set(openIds)
  items.forEach((item, i) => {
    if (indexes.includes(i)) next.add(item.id)
    else next.delete(item.id)
  })
  return next
}

// The shareable link to one question. `origin` should be the site's
// canonical origin (shareOrigin in shared/lib/environment.js), so a pasted
// link reaches the page — and its preview — without a redirect.
export function questionLink(origin, path, id) {
  return `${origin}${path}#${id}`
}

// Where a FAQ clip's files live: public/help/<name>.webm, with a .jpg poster
// frame shown before it plays (and instead of it with reduced motion).
const CLIP_DIR = '/help'
export function clipSources(name) {
  return { video: `${CLIP_DIR}/${name}.webm`, poster: `${CLIP_DIR}/${name}.jpg` }
}
