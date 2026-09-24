import { useEffect } from 'react'
import { Button, Stack } from '@chakra-ui/react'
import PageHeader from './PageHeader.jsx'
import BackButton from './BackButton.jsx'
import Panel from './kit/Panel.jsx'
import { useUnsavedForm } from '../lib/useUnsavedForm.js'

// A full page for filling in one thing (the app has no form dialogs): the
// page header with its back arrow — which is also Cancel — and the page's
// body. Back returns to wherever the user came from, or to `fallback` when
// the page was opened directly (useGoBack). `backDisabled` holds the user on
// the page while something can't be interrupted (a restore under way). It
// opens at the top, wherever the page it came from was scrolled to.
export default function FormPage({ eyebrow, title, description, fallback, backDisabled, children }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return (
    <Stack spacing={5} maxW="640px">
      <PageHeader eyebrow={eyebrow} title={title} description={description}
        leading={<BackButton fallback={fallback} isDisabled={backDisabled} />} />
      {children}
    </Stack>
  )
}

// A form page's form: its fields in a card (`bare` for a form that lays out
// its own cards), then the primary action at the bottom — full width on
// phones, with `secondary` (e.g. Delete) beside it from `sm` up and below it
// on phones. Enter submits; `onSubmit` is called after preventDefault.
// `submitProps` reach the submit button. The form carries the "unsaved form"
// signal (useUnsavedForm) from its first edit; `unsaved` forces it on.
export function PageForm({
  onSubmit, busy, submitLabel = 'Save', submitProps, secondary, noValidate, bare, unsaved, children,
}) {
  const unsavedProps = useUnsavedForm(unsaved)
  function handleSubmit(e) {
    e.preventDefault()
    onSubmit()
  }
  return (
    <Stack as="form" spacing={5} onSubmit={handleSubmit} noValidate={noValidate} {...unsavedProps}>
      {bare ? children : <Panel>{children}</Panel>}
      <Stack direction={{ base: 'column-reverse', sm: 'row' }} spacing={3}>
        {secondary}
        {/* Grows only in the row layout: a flex-basis of 0 in the phone's
            column would collapse the button to its padding. */}
        <Button type="submit" flex={{ sm: 1 }} isLoading={busy} {...submitProps}>{submitLabel}</Button>
      </Stack>
    </Stack>
  )
}
