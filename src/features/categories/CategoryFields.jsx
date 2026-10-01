import { useState } from 'react'
import {
  Box, FormControl, FormErrorMessage, FormHelperText, FormLabel, HStack, IconButton, Input,
  SimpleGrid, Stack, Switch, Text, Tooltip,
} from '@chakra-ui/react'
import { Check } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { categoryIcon } from '../../shared/lib/icons.jsx'
import { categoryPicker } from '../../shared/lib/categoryStyle.js'
import { CATEGORY_NAME_MAX, categoryDraft, categoryNameError } from './categoryMath.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The name / icon / colour form a category is added or edited with — the
// new-category page and the category page's Edit panel share it. An income
// category also has the "Counts as savings" switch (0084).
// `useCategoryDraft` holds its state; `others` are the user's categories of
// the same kind (for the duplicate-name rule).
export function useCategoryDraft(category, others) {
  const [start] = useState(() => categoryDraft(category))
  const [name, setName] = useState(start.name)
  const [icon, setIcon] = useState(start.icon)
  const [color, setColor] = useState(start.color)
  const [savings, setSavings] = useState(start.savings)
  const [touched, setTouched] = useState(false)
  const nameError = categoryNameError(name, others)
  return {
    name, setName, icon, setIcon, color, setColor, savings, setSavings, touched, setTouched, nameError,
    values: { name, icon, color, savings },
  }
}

export default function CategoryFields({ draft, kind }) {
  const t = useT('categories')
  const {
    name, setName, icon, setIcon, color, setColor, savings, setSavings, touched, setTouched, nameError,
  } = draft
  return (
    <Stack spacing={5}>
      <HStack spacing={3} align="start">
        <Box pt={8}><CategoryBadge category={draft.values} kind={kind} size={40} /></Box>
        <FormControl isRequired isInvalid={touched && !!nameError}>
          <FormLabel>{t('fields.name')}</FormLabel>
          <Input value={name} maxLength={CATEGORY_NAME_MAX + 10}
            onChange={(e) => setName(e.target.value)} onBlur={() => name && setTouched(true)}
            placeholder={t(`fields.placeholder.${kind === 'income' ? 'income' : 'expense'}`)} />
          <FormErrorMessage>{nameError}</FormErrorMessage>
        </FormControl>
      </HStack>

      <FormControl as="fieldset">
        <FormLabel as="legend">{t('fields.icon')}</FormLabel>
        <IconPicker value={icon} onChange={setIcon} />
      </FormControl>

      <FormControl as="fieldset">
        <FormLabel as="legend">{t('fields.colour')}</FormLabel>
        <HStack spacing={2} flexWrap="wrap" role="radiogroup" aria-label={t('fields.colour')}>
          <Swatch label={t('fields.defaultColour')} on={!color} onClick={() => setColor(null)} />
          {categoryPicker().colours.map((c) => (
            <Swatch key={c.key} label={c.label} hex={c.hex} on={color === c.key}
              onClick={() => setColor(c.key)} />
          ))}
        </HStack>
        <FormHelperText>{t('fields.colourHelp')}</FormHelperText>
      </FormControl>

      {kind === 'income' && (
        <FormControl>
          <HStack justify="space-between" spacing={4}>
            <FormLabel htmlFor="category-savings" mb={0}>{t('fields.savings')}</FormLabel>
            <Switch id="category-savings" isChecked={savings} onChange={(e) => setSavings(e.target.checked)} />
          </HStack>
          <FormHelperText>{t('fields.savingsHelp')}</FormHelperText>
        </FormControl>
      )}
    </Stack>
  )
}

// The icons in labelled sections, in a scroll box so the ~50 of them don't
// push the rest of the form off a phone screen. 44px targets; the grid fills
// the width (six across on a 390px phone).
function IconPicker({ value, onChange }) {
  const t = useT('categories')
  return (
    <Box role="radiogroup" aria-label={t('fields.icon')} maxH="264px" overflowY="auto" borderWidth="1px"
      borderColor="border.default" borderRadius="lg" px={2} pb={2}>
      {categoryPicker().icons.map((g) => (
        <Box key={g.label} role="group" aria-label={g.label}>
          <Text position="sticky" top={0} zIndex={1} bg="bg.surface" pt={2} pb={1}
            fontSize="xs" fontWeight="600" color="text.muted">
            {g.label}
          </Text>
          <SimpleGrid minChildWidth="44px" spacing={1}>
            {g.keys.map(({ key: k, label }) => {
              const Icon = categoryIcon({ icon: k })
              const on = value === k
              return (
                <Tooltip key={k} label={label} openDelay={400}>
                  <IconButton boxSize="44px" minW="44px" role="radio" aria-checked={on}
                    aria-label={label}
                    variant={on ? 'solid' : 'ghost'} colorScheme={on ? 'brand' : 'gray'}
                    icon={<Icon size={18} />} onClick={() => onChange(k)} />
                </Tooltip>
              )
            })}
          </SimpleGrid>
        </Box>
      ))}
    </Box>
  )
}

function Swatch({ label, hex, on, onClick }) {
  return (
    <Tooltip label={label} openDelay={400}>
      <Box as="button" type="button" role="radio" aria-checked={on} aria-label={label} onClick={onClick}
        boxSize="36px" borderRadius="full" bg={hex ?? 'bg.subtle'} borderWidth="2px"
        borderColor={on ? 'text.primary' : 'border.default'} display="grid" placeItems="center"
        color={hex ? 'white' : 'text.muted'} _focusVisible={{ boxShadow: 'outline' }}>
        {on && <Check size={16} />}
      </Box>
    </Tooltip>
  )
}
