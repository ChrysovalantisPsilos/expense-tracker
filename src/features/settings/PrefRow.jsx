import { HStack, Box, Switch, FormLabel } from '@chakra-ui/react'
import { InfoNote } from '../../shared/ui/InfoToggle.jsx'

// One on/off preference on a Settings page: bold label, a muted one-line
// hint under it (`more` puts the rest behind an ⓘ), the switch on the right.
export default function PrefRow({ id, label, hint, more, isChecked, isDisabled, onChange }) {
  return (
    <HStack justify="space-between" align="start" spacing={4}>
      <Box minW={0}>
        <FormLabel htmlFor={id} m={0} fontWeight="600" cursor="pointer">{label}</FormLabel>
        <InfoNote more={more}>{hint}</InfoNote>
      </Box>
      <Switch id={id} colorScheme="brand" isChecked={isChecked} isDisabled={isDisabled} onChange={onChange} mt={1} />
    </HStack>
  )
}
