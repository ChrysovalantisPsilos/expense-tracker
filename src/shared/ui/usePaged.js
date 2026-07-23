import { useEffect, useState } from 'react'
import { pageCount, pageSlice } from '../lib/paginate.js'

// Client-side pagination for an in-memory list. Resets to page 1 when
// `resetKey` changes (e.g. the dashboard period), and clamps if the list
// shrinks below the current page (e.g. after a delete).
export function usePaged(items, size = 10, resetKey) {
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [resetKey])

  const count = pageCount(items.length, size)
  const safePage = Math.min(page, count)
  return { page: safePage, setPage, count, pageItems: pageSlice(items, safePage, size) }
}
