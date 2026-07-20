import { Input, InputGroup, InputRightElement, IconButton } from '@chakra-ui/react'
import { X } from 'lucide-react'

// A native date input with a guaranteed clear (✕) affordance — native date
// fields can't reliably be emptied once set, which makes "optional" dates feel
// stuck. Shows the ✕ only when there's a value to clear.
export default function ClearableDate({ value, onChange, ...rest }) {
  return (
    <InputGroup>
      <Input type="date" value={value} pr={value ? 9 : undefined}
        onChange={(e) => onChange(e.target.value)} {...rest} />
      {value && (
        <InputRightElement>
          <IconButton aria-label="Clear date" size="xs" variant="ghost" tabIndex={-1}
            icon={<X size={14} />} onClick={() => onChange('')} />
        </InputRightElement>
      )}
    </InputGroup>
  )
}
