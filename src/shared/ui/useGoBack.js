import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// "Back": to wherever the user came from in the app, or to `fallback` when
// the page was opened directly (a shared link, a reload in a fresh tab —
// nothing in-app to go back to). React Router numbers its history entries
// (`idx`), so idx 0 is the first page of this visit; a replace (e.g. a page
// mirroring its state into the query string) keeps the number. `replace`
// swaps the page for `fallback` instead of adding it on top, so the browser's
// own back button doesn't return to a form that's done.
export default function useGoBack(fallback = '/', { replace = false } = {}) {
  const navigate = useNavigate()
  return useCallback(
    () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback, { replace })),
    [navigate, fallback, replace],
  )
}
