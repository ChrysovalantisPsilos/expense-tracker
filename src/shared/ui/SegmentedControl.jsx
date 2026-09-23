import { Button, HStack } from '@chakra-ui/react'

// A pill of mutually-exclusive choices (the selected one filled in brand).
// options: [[value, label], …]. `isFitted` stretches the buttons to share the
// control's width evenly; other props (w, size overrides) pass to the pill.
export default function SegmentedControl({ options, value, onChange, size = 'xs', isFitted, label, ...props }) {
  return (
    <HStack role="group" aria-label={label} spacing={1} bg="bg.subtle" p={1}
      borderRadius="lg" {...props}>
      {options.map(([v, text]) => (
        <Button key={v} size={size} borderRadius="md" flex={isFitted ? '1' : undefined}
          variant={value === v ? 'solid' : 'ghost'} colorScheme={value === v ? 'brand' : 'gray'}
          aria-pressed={value === v} onClick={() => onChange(v)}>{text}</Button>
      ))}
    </HStack>
  )
}
