import { useState } from 'react'
import { Stack, HStack, Switch, Text, Input } from '@chakra-ui/react'

// An explicitly-optional date field: a switch reveals the picker, and turning
// it off clears the value. Avoids the "can't empty a native date input" trap —
// no value simply means the switch is off. Starts on when a value is present
// (e.g. editing an existing entry).
export default function OptionalDate({ label, value, onChange, ...rest }) {
  const [on, setOn] = useState(!!value)

  function toggle(next) {
    setOn(next)
    if (!next) onChange('') // turning it off clears the date
  }

  return (
    <Stack spacing={on ? 2 : 0}>
      <HStack spacing={2}>
        <Switch size="sm" isChecked={on}
          onChange={(e) => toggle(e.target.checked)} />
        <Text fontSize="sm" color="text.muted" cursor="pointer"
          onClick={() => toggle(!on)}>{label}</Text>
      </HStack>
      {on && (
        <Input type="date" value={value || ''} autoFocus={!value}
          onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
    </Stack>
  )
}
