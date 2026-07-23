// Pure pagination math (unit-tested). Pages are 1-indexed.
export function pageCount(total, size) {
  return Math.max(1, Math.ceil(total / size))
}

export function pageSlice(items, page, size) {
  const start = (page - 1) * size
  return items.slice(start, start + size)
}
