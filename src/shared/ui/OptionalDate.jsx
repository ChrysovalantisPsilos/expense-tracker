import { useEffect, useId, useRef, useState } from 'react'
import { Stack, HStack, Switch, Text, Input } from '@chakra-ui/react'

// An explicitly-optional date field: a switch reveals the picker, and turning
// it off clears the value. Avoids the "can't empty a native date input" trap —
// no value simply means the switch is off. Starts on when a value is present
// (e.g. editing an existing entry).
export default function OptionalDate({ label, value, onChange, ...rest }) {
  const [on, setOn] = useState(!!value)
  const id = useId()
  const inputRef = useRef(null)
  // Set when the user switches it on with no date yet: the revealed picker
  // takes focus (a response to their action, not focus-stealing on load).
  const focusNext = useRef(false)

  useEffect(() => {
    if (on && focusNext.current) inputRef.current?.focus()
    focusNext.current = false
  }, [on])

  function toggle(next) {
    focusNext.current = next && !value
    setOn(next)
    if (!next) onChange('') // turning it off clears the date
  }

  return (
    <Stack spacing={on ? 2 : 0}>
      <HStack spacing={2}>
        <Switch id={id} size="sm" isChecked={on}
          onChange={(e) => toggle(e.target.checked)} />
        <Text as="label" htmlFor={id} fontSize="sm" color="text.muted" cursor="pointer">
          {label}
        </Text>
      </HStack>
      {on && (
        <Input ref={inputRef} type="date" value={value || ''} aria-label={label}
          onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
    </Stack>
  )
}
