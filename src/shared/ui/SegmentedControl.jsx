import { Button, HStack } from '@chakra-ui/react'

// A pill of mutually-exclusive choices (the selected one filled in brand).
// options: [[value, label], …]. `isFitted` stretches the buttons to share the
// control's width evenly; other props (w, size overrides) pass to the pill.
// Each choice is at least 42px wide, so with the 4px gap every one keeps a
// whole 44px touch area (the Button theme's HIT_AREA) for a short label too.
export default function SegmentedControl({ options, value, onChange, size = 'xs', isFitted, label, ...props }) {
  return (
    <HStack role="group" aria-label={label} spacing={1} bg="bg.subtle" p={1}
      borderRadius="lg" {...props}>
      {options.map(([v, text]) => (
        <Button key={v} size={size} borderRadius="md" flex={isFitted ? '1' : undefined} minW="42px"
          variant={value === v ? 'solid' : 'ghost'} colorScheme={value === v ? 'brand' : 'gray'}
          aria-pressed={value === v} onClick={() => onChange(v)}>{text}</Button>
      ))}
    </HStack>
  )
}
