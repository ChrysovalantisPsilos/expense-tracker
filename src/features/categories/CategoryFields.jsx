import { useState } from 'react'
import {
  Box, FormControl, FormErrorMessage, FormHelperText, FormLabel, HStack, IconButton, Input,
  SimpleGrid, Stack, Text, Tooltip,
} from '@chakra-ui/react'
import { Check } from 'lucide-react'
import CategoryBadge from '../../shared/ui/CategoryBadge.jsx'
import { categoryIcon } from '../../shared/lib/icons.jsx'
import {
  CATEGORY_COLORS, CATEGORY_COLOR_KEYS, CATEGORY_ICON_GROUPS, CATEGORY_ICON_LABELS, categoryIconKey,
} from '../../shared/lib/categoryStyle.js'
import { CATEGORY_NAME_MAX, categoryNameError } from './categoryMath.js'

// The name / icon / colour form a category is added or edited with — the
// new-category page and the category page's Edit panel share it.
// `useCategoryDraft` holds its state; `others` are the user's categories of
// the same kind (for the duplicate-name rule).
export function useCategoryDraft(category, others) {
  const isEdit = !!category?.id
  const [name, setName] = useState(category?.name ?? '')
  // A legacy/unknown stored icon starts on the icon its badge shows, so saving
  // keeps its look.
  const [icon, setIcon] = useState(isEdit ? categoryIconKey(category) : 'other')
  const [color, setColor] = useState(category?.color ?? null)
  const [touched, setTouched] = useState(false)
  const nameError = categoryNameError(name, others)
  return {
    name, setName, icon, setIcon, color, setColor, touched, setTouched, nameError,
    values: { name, icon, color },
  }
}

export default function CategoryFields({ draft, kind }) {
  const { name, setName, icon, setIcon, color, setColor, touched, setTouched, nameError } = draft
  return (
    <Stack spacing={5}>
      <HStack spacing={3} align="start">
        <Box pt={8}><CategoryBadge category={draft.values} kind={kind} size={40} /></Box>
        <FormControl isRequired isInvalid={touched && !!nameError}>
          <FormLabel>Name</FormLabel>
          <Input value={name} maxLength={CATEGORY_NAME_MAX + 10}
            onChange={(e) => setName(e.target.value)} onBlur={() => name && setTouched(true)}
            placeholder={kind === 'income' ? 'Freelance' : 'Pets'} />
          <FormErrorMessage>{nameError}</FormErrorMessage>
        </FormControl>
      </HStack>

      <FormControl as="fieldset">
        <FormLabel as="legend">Icon</FormLabel>
        <IconPicker value={icon} onChange={setIcon} />
      </FormControl>

      <FormControl as="fieldset">
        <FormLabel as="legend">Colour</FormLabel>
        <HStack spacing={2} flexWrap="wrap" role="radiogroup" aria-label="Colour">
          <Swatch label="Default" on={!color} onClick={() => setColor(null)} />
          {CATEGORY_COLOR_KEYS.map((k) => (
            <Swatch key={k} label={k} hex={CATEGORY_COLORS[k]} on={color === k}
              onClick={() => setColor(k)} />
          ))}
        </HStack>
        <FormHelperText>Used for the category’s icon everywhere in the app.</FormHelperText>
      </FormControl>
    </Stack>
  )
}

// The icons in labelled sections, in a scroll box so the ~50 of them don't
// push the rest of the form off a phone screen. 44px targets; the grid fills
// the width (six across on a 390px phone).
function IconPicker({ value, onChange }) {
  return (
    <Box role="radiogroup" aria-label="Icon" maxH="264px" overflowY="auto" borderWidth="1px"
      borderColor="border.default" borderRadius="lg" px={2} pb={2}>
      {CATEGORY_ICON_GROUPS.map((g) => (
        <Box key={g.label} role="group" aria-label={g.label}>
          <Text position="sticky" top={0} zIndex={1} bg="bg.surface" pt={2} pb={1}
            fontSize="xs" fontWeight="600" color="text.muted">
            {g.label}
          </Text>
          <SimpleGrid minChildWidth="44px" spacing={1}>
            {g.keys.map((k) => {
              const Icon = categoryIcon({ icon: k })
              const on = value === k
              return (
                <Tooltip key={k} label={CATEGORY_ICON_LABELS[k]} openDelay={400}>
                  <IconButton boxSize="44px" minW="44px" role="radio" aria-checked={on}
                    aria-label={CATEGORY_ICON_LABELS[k]}
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
