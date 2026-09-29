import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Grid, Heading, HStack, IconButton, Text, useToast,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import { ArrowLeft, Plus, MoreVertical, LogOut, Trash2, Pencil, Camera, FileDown, Share2 } from 'lucide-react'
import { uploadGroupImage } from './groups.js'
import { pluralise } from './groupFormat.js'
import { PageAction } from '../../shared/ui/PageHeader.jsx'
import Figure from '../../shared/ui/kit/Figure.jsx'
import GroupMark from './GroupMark.jsx'
import AvatarStack from './AvatarStack.jsx'
import { userMessage } from '../../shared/lib/errors.js'
import { ShellSlot, useShellHeader } from '../../shared/ui/ShellHeader.jsx'
import { ONE_LINE } from '../../shared/lib/shortLandscape.js'
import { useT } from '../../shared/lib/i18n/I18nProvider.jsx'

// The photo button on a small (sideways header) photo: smaller, tucked in.
const SMALL_CAMERA = { boxSize: '20px', minW: '20px', bottom: '-4px', right: '-4px' }

// The group page's header, styled after the landing's trip card: the group
// photo (owner can replace it) or a solid brand tile, the name over a
// tappable member stack that opens the Members page, and the group's
// "Total" on the right. Back, "Add expense" and the ⋯ menu sit on the same
// row from `md` up; on phones they form a toolbar above it so the name and
// total keep their room. Menu actions are callbacks; `onLeave` is omitted
// when the viewer isn't a member. `total` is a formatted string. On a phone
// held sideways it's one row in the shell's slim header instead.
export default function GroupHeader({
  group, members, myUserId, isOwner, total, onPhotoChanged,
  onAdd, onMembers, onReport, onShare, onRename, onLeave, onDelete,
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT('groups')
  const imgRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const sideways = !!useShellHeader()

  async function onGroupImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadGroupImage(group.id, file)
      await onPhotoChanged()
      toast({ title: t('header.photoUpdated'), status: 'success' })
    } catch (err) {
      console.error('[groups] photo upload failed:', err)
      toast({ title: t('header.photoFailed'), description: userMessage(err), status: 'error' })
    }
    finally { setUploading(false) }
  }

  // The group photo; the owner can replace it.
  const photo = (size) => (
    <Box position="relative" flexShrink={0}>
      <GroupMark name={group.name} src={group.image_url} size={size} />
      {isOwner && (
        <>
          <IconButton aria-label={t('header.changePhoto')} icon={<Camera size={size < 40 ? 10 : 12} />}
            size="xs" borderRadius="full" position="absolute" zIndex={5}
            {...(size < 40 ? SMALL_CAMERA : { bottom: '-6px', right: '-6px' })}
            isLoading={uploading} onClick={() => imgRef.current?.click()} />
          <input ref={imgRef} type="file" accept="image/*" hidden onChange={onGroupImage} />
        </>
      )}
    </Box>
  )
  const back = (props) => (
    <IconButton aria-label={t('common:actions.back')} variant="ghost" size="sm" ml={-2} {...props}
      icon={<ArrowLeft size={18} />} onClick={() => navigate('/groups')} />
  )
  const menu = (
    <Menu>
      <MenuButton as={IconButton} aria-label={t('header.options')} size="sm" mr={-2}
        variant="ghost" icon={<MoreVertical size={18} />} />
      <MenuList>
        <MenuItem icon={<Share2 size={16} />} onClick={onShare}>{t('header.shareSummary')}</MenuItem>
        <MenuItem icon={<FileDown size={16} />} onClick={onReport}>
          {t('header.statement')}
        </MenuItem>
        {isOwner && (
          <MenuItem icon={<Pencil size={16} />} onClick={onRename}>{t('header.rename')}</MenuItem>
        )}
        {onLeave && (
          <MenuItem icon={<LogOut size={16} />} onClick={onLeave}>{t('header.leave')}</MenuItem>
        )}
        {isOwner && (
          <MenuItem icon={<Trash2 size={16} />} color="status.negative" onClick={onDelete}>
            {t('header.delete')}
          </MenuItem>
        )}
      </MenuList>
    </Menu>
  )

  // A phone held sideways: one row in the shell's slim header — back, a
  // smaller photo, the name over the member count, the total and the ⋯
  // menu. The rail's Add is the page's only one there.
  if (sideways) {
    return (
      <ShellSlot slot="title">
        <HStack spacing={3} flex="1" minW={0}>
          {back({ flexShrink: 0 })}
          {photo(32)}
          <Box flex="1" minW={0}>
            <Heading as="h1" fontSize="md" letterSpacing="-0.01em" lineHeight="1.25" sx={ONE_LINE}>
              {group.name}
            </Heading>
            <MemberStack members={members} myUserId={myUserId} onClick={onMembers} compact />
          </Box>
          <Figure label={t('total')} value={total} size="md" align="right" flexShrink={0} lineHeight="1.2" />
          {menu}
        </HStack>
      </ShellSlot>
    )
  }

  return (
    <Grid alignItems="center" columnGap={3} rowGap={2}
      templateColumns={{ base: '1fr auto', md: 'auto 1fr auto' }}
      templateAreas={{ base: '"back actions" "hero hero"', md: '"back hero actions"' }}>
      {back({ gridArea: 'back', justifySelf: 'start' })}

      <HStack gridArea="hero" spacing={3} minW={0}>
        {photo(48)}
        <Box flex="1" minW={0}>
          <Heading as="h1" fontSize={{ base: 'xl', md: '2xl' }} letterSpacing="-0.02em"
            lineHeight="1.25" overflowWrap="anywhere">
            {group.name}
          </Heading>
          <Box mt={1}>
            <MemberStack members={members} myUserId={myUserId} onClick={onMembers} />
          </Box>
        </Box>
        <Figure label={t('total')} value={total} size="lg" align="right" flexShrink={0} />
      </HStack>

      <HStack gridArea="actions" spacing="14px">
        <PageAction icon={<Plus size={16} />} label={t('header.addExpense')} onClick={onAdd} />
        {menu}
      </HStack>
    </Grid>
  )
}

// The avatar stack and member count — one button that opens the Members page.
// `compact`: just the count, in small type (the sideways header).
function MemberStack({ members, myUserId, onClick, compact = false }) {
  const t = useT('groups')
  const count = pluralise(members.length, 'member')
  return (
    <HStack as="button" type="button" onClick={onClick} spacing={2} maxW="100%"
      aria-label={t('header.showMembers', { members: count })}
      borderRadius="full" pr={2} ml={-0.5} layerStyle="hitArea" _hover={{ bg: 'bg.subtle' }}
      _focusVisible={{ boxShadow: 'outline' }} transition="background 0.1s">
      {!compact && <AvatarStack members={members} myUserId={myUserId} />}
      <Text as="span" fontSize={compact ? 'xs' : 'sm'} color="text.muted" fontWeight="500" whiteSpace="nowrap">
        {count}
      </Text>
    </HStack>
  )
}
