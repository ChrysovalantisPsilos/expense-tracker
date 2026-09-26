import { forwardRef } from 'react'
import {
  Button, HStack, Menu, MenuButton, MenuItemOption, MenuList, MenuOptionGroup, Text,
  useFormControl, useMultiStyleConfig,
} from '@chakra-ui/react'
import { ChevronDown } from 'lucide-react'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { viewerName } from './groupFormat.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// A member picker that shows each member's profile picture (a native <select>
// can only show text): the chosen member on the button, everyone in the list,
// the viewer highlighted as everywhere else. It looks and behaves like the
// form's other fields: the Input field styles (so an invalid pick shows like
// any other), and the surrounding FormControl's label, required state and
// error message are wired to the button, which reads "Paid by, <name>". The
// pictures are decorative (the name is always written next to them). The list
// opens aligned to the button's right edge and never narrower than 224px, so
// on a phone it grows leftwards instead of off the screen. Forwards its ref
// to the button so a form can focus it on a validation error.
const MemberSelect = forwardRef(function MemberSelect(
  { members, value, onChange, myMemberId }, ref,
) {
  const t = useT('groups')
  const field = useMultiStyleConfig('Input', {}).field
  const control = useFormControl({})
  // The button's name is the label plus the chosen member ("Paid by, You").
  const valueId = `${control.id}-value`
  const chosen = members.find((m) => m.id === value)
  const who = (m) => viewerName(members, m.id, myMemberId)
  const avatar = (m) => (
    <UserAvatar size="xs" name={m.display_name} src={m.avatar_url} highlight={m.id === myMemberId} aria-hidden />
  )
  return (
    <Menu placement="bottom-end" isLazy modifiers={[{ name: 'preventOverflow', options: { padding: 16 } }]}>
      <MenuButton ref={ref} as={Button} variant="unstyled" {...control}
        aria-labelledby={`${control.id}-label ${valueId}`}
        sx={field} display="flex" alignItems="center" w="full" fontWeight="400" textAlign="start" px={3}
        color="text.primary" _expanded={{ borderColor: 'accent.fg' }} rightIcon={<ChevronDown size={16} />}>
        {chosen ? (
          <HStack as="span" spacing={2} minW={0}>
            {avatar(chosen)}
            <Text as="span" id={valueId} noOfLines={1}>{who(chosen)}</Text>
          </HStack>
        ) : <Text as="span" id={valueId} color="text.muted">{t('form.choose')}</Text>}
      </MenuButton>
      <MenuList minW="224px" maxW="calc(100vw - 32px)" maxH="60vh" overflowY="auto">
        <MenuOptionGroup type="radio" value={value} onChange={onChange}>
          {members.map((m) => (
            <MenuItemOption key={m.id} value={m.id} minH="44px">
              <HStack as="span" spacing={2} minW={0}>
                {avatar(m)}
                <Text as="span" noOfLines={1}>{who(m)}</Text>
              </HStack>
            </MenuItemOption>
          ))}
        </MenuOptionGroup>
      </MenuList>
    </Menu>
  )
})

export default MemberSelect
