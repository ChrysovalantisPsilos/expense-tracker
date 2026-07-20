// Date helpers. All app dates are YYYY-MM-DD strings.
// (Uses toISOString like the original call sites, so behaviour is unchanged.)

export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10)

export const today = () => isoDate(new Date())

// First/last day of a month as { from, to } YYYY-MM-DD strings.
export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: isoDate(start), to: isoDate(end) }
}

// The last `n` calendar months, oldest → newest, each as
// { key: 'YYYY-MM', label: 'Jan', from, to }.
export function lastMonths(n, d = new Date()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    out.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: start.toLocaleDateString('en-US', { month: 'short' }),
      from: isoDate(start), to: isoDate(end),
    })
  }
  return out
}
