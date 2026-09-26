import { Box, Flex, SimpleGrid, Text, useRadio, useRadioGroup } from '@chakra-ui/react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { ONE_LINE } from '../../shared/lib/shortLandscape.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'
import { categoryDisplayName } from '../../shared/lib/categoryName.js'

// "No category" as a radio value (a radio can't hold '').
const NONE = 'none'

// The transaction form's category picker as a grid of tiles (a phone held
// sideways, where the form has the width for it): one radio group, the
// chosen tile ringed in coral, and "Uncategorized" last. `value` / `onChange`
// use the form's category id ('' for none). Arrow keys move between tiles,
// as in any radio group.
export default function CategoryGrid({ categories, value, onChange, kind }) {
  const t = useT('transactions')
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'category',
    value: value || NONE,
    onChange: (v) => onChange(v === NONE ? '' : v),
  })
  return (
    <SimpleGrid {...getRootProps()} aria-label={t('form.category')} minChildWidth="88px" spacing={2}>
      {categories.map((c) => (
        <Tile key={c.id} {...getRadioProps({ value: c.id })} category={c} kind={kind} label={categoryDisplayName(c)} />
      ))}
      <Tile {...getRadioProps({ value: NONE })} category={null} kind={kind} label={t('uncategorized')} />
    </SimpleGrid>
  )
}

function Tile({ category, kind, label, ...radioProps }) {
  const { getInputProps, getRadioProps } = useRadio(radioProps)
  return (
    <Box as="label" minW={0}>
      <input {...getInputProps()} />
      <Flex {...getRadioProps()} title={label} direction="column" align="center" gap={1.5} px={1.5} py={2.5}
        borderWidth="1px" borderColor="border.default" borderRadius="xl" cursor="pointer"
        transition="background 0.15s, border-color 0.15s" _hover={{ bg: 'bg.subtle' }}
        _checked={{ borderColor: 'accent.solid', bg: 'accent.subtle', boxShadow: 'inset 0 0 0 1px var(--chakra-colors-accent-solid)' }}
        sx={{ '&[data-focus-visible]': { boxShadow: 'outline' } }}>
        <CategoryBadge category={category} kind={kind} size={28} />
        <Text fontSize="xs" fontWeight="600" maxW="full" sx={ONE_LINE}>{label}</Text>
      </Flex>
    </Box>
  )
}
