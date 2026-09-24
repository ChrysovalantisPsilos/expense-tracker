import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// "Back": to wherever the user came from in the app, or to `fallback` when
// the page was opened directly (a shared link, a reload in a fresh tab —
// nothing in-app to go back to). React Router numbers its history entries
// (`idx`), so idx 0 is the first page of this visit.
export default function useGoBack(fallback = '/') {
  const navigate = useNavigate()
  return useCallback(
    () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback)),
    [navigate, fallback],
  )
}
