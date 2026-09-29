// The Add page's URL contract (/transactions/new). Pure: unit-tested in
// test/addLinks.test.js.
//
//   /transactions/new?kind=income&category=<id>&repeat=1
//
//   kind      'expense' (the default, left out of the link) or 'income'
//   category  one of the user's categories of that kind to open on (checked
//             against them on the page: presetCategoryId)
//   repeat    opens with Repeat switched on: the one way to add a recurring
//             expense or income (the Recurring page only lists and edits them)

export function addEntryLink({ kind = 'expense', category = null, repeat = false } = {}) {
  const q = new URLSearchParams()
  if (kind === 'income') q.set('kind', 'income')
  if (category) q.set('category', category)
  if (repeat) q.set('repeat', '1')
  const s = q.toString()
  return s ? `/transactions/new?${s}` : '/transactions/new'
}

// URLSearchParams → { kind, category, repeat }; anything unknown reads as the
// default.
export function parseAddParams(params) {
  return {
    kind: params.get('kind') === 'income' ? 'income' : 'expense',
    category: params.get('category') || null,
    repeat: params.get('repeat') === '1',
  }
}

// Where an old "new recurring entry" link (/recurring/new?kind=…) goes now:
// Add, with Repeat on, keeping its kind.
export const recurringNewLink = (params) => addEntryLink({ kind: parseAddParams(params).kind, repeat: true })
