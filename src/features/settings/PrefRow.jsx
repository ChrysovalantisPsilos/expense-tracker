import { HStack, Box, Text, Switch, FormLabel } from '@chakra-ui/react'

// One on/off preference on a Settings page: bold label, a muted one-line
// hint under it, the switch on the right.
export default function PrefRow({ id, label, hint, isChecked, isDisabled, onChange }) {
  return (
    <HStack justify="space-between" align="start" spacing={4}>
      <Box minW={0}>
        <FormLabel htmlFor={id} m={0} fontWeight="600" cursor="pointer">{label}</FormLabel>
        <Text fontSize="sm" color="text.muted">{hint}</Text>
      </Box>
      <Switch id={id} colorScheme="brand" isChecked={isChecked} isDisabled={isDisabled} onChange={onChange} mt={1} />
    </HStack>
  )
}
