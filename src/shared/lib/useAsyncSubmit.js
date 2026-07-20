import { useState } from 'react'
import { useToast } from '@chakra-ui/react'

// Wraps an async form action with busy state and a failure toast, removing the
// setBusy(true) / try / catch(toast) / finally(setBusy(false)) boilerplate
// repeated across every form. Validation and success toasts stay in the caller.
//
//   const { busy, run } = useAsyncSubmit()
//   await run(async () => { await save(...); toast({ title: 'Saved' }); onSaved() })
//
// `run` returns the action's result, or undefined if it threw.
export function useAsyncSubmit() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function run(fn, { errorTitle } = {}) {
    setBusy(true)
    try {
      return await fn()
    } catch (e) {
      toast({
        title: errorTitle || e.message,
        description: errorTitle ? e.message : undefined,
        status: 'error',
      })
      return undefined
    } finally {
      setBusy(false)
    }
  }

  return { busy, run }
}
