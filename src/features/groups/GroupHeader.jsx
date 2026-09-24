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

// The group page's header, styled after the landing's trip card: the group
// photo (owner can replace it) or a solid brand tile, the name over a
// tappable member stack that opens the Members sheet, and the group's
// "Total" on the right. Back, "Add expense" and the ⋯ menu sit on the same
// row from `md` up; on phones they form a toolbar above it so the name and
// total keep their room. Menu actions are callbacks; `onLeave` is omitted
// when the viewer isn't a member. `total` is a formatted string.
export default function GroupHeader({
  group, members, myUserId, isOwner, total, onPhotoChanged,
  onAdd, onMembers, onReport, onShare, onRename, onLeave, onDelete,
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const imgRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function onGroupImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadGroupImage(group.id, file)
      await onPhotoChanged()
      toast({ title: 'Group photo updated', status: 'success' })
    } catch (err) {
      console.error('[groups] photo upload failed:', err)
      toast({ title: 'Couldn’t update photo', description: userMessage(err), status: 'error' })
    }
    finally { setUploading(false) }
  }

  return (
    <Grid alignItems="center" columnGap={3} rowGap={2}
      templateColumns={{ base: '1fr auto', md: 'auto 1fr auto' }}
      templateAreas={{ base: '"back actions" "hero hero"', md: '"back hero actions"' }}>
      <IconButton gridArea="back" justifySelf="start" aria-label="Back" variant="ghost" size="sm" ml={-2}
        icon={<ArrowLeft size={18} />} onClick={() => navigate('/groups')} />

      <HStack gridArea="hero" spacing={3} minW={0}>
        <Box position="relative" flexShrink={0}>
          <GroupMark name={group.name} src={group.image_url} size={48} />
          {isOwner && (
            <>
              <IconButton aria-label="Change group photo" icon={<Camera size={12} />}
                size="xs" borderRadius="full" position="absolute" bottom="-6px" right="-6px"
                isLoading={uploading} onClick={() => imgRef.current?.click()} />
              <input ref={imgRef} type="file" accept="image/*" hidden onChange={onGroupImage} />
            </>
          )}
        </Box>
        <Box flex="1" minW={0}>
          <Heading as="h1" fontSize={{ base: 'xl', md: '2xl' }} letterSpacing="-0.02em"
            lineHeight="1.25" overflowWrap="anywhere">
            {group.name}
          </Heading>
          <Box mt={1}>
            <MemberStack members={members} myUserId={myUserId} onClick={onMembers} />
          </Box>
        </Box>
        <Figure label="Total" value={total} size="lg" align="right" flexShrink={0} />
      </HStack>

      <HStack gridArea="actions" spacing={2}>
        <PageAction icon={<Plus size={16} />} label="Add expense" onClick={onAdd} />
        <Menu>
          <MenuButton as={IconButton} aria-label="Group options" size="sm" mr={-2}
            variant="ghost" icon={<MoreVertical size={18} />} />
          <MenuList>
            <MenuItem icon={<Share2 size={16} />} onClick={onShare}>Share summary</MenuItem>
            <MenuItem icon={<FileDown size={16} />} onClick={onReport}>
              Download statement (PDF)
            </MenuItem>
            {isOwner && (
              <MenuItem icon={<Pencil size={16} />} onClick={onRename}>Rename group</MenuItem>
            )}
            {onLeave && (
              <MenuItem icon={<LogOut size={16} />} onClick={onLeave}>Leave group</MenuItem>
            )}
            {isOwner && (
              <MenuItem icon={<Trash2 size={16} />} color="status.negative" onClick={onDelete}>
                Delete group
              </MenuItem>
            )}
          </MenuList>
        </Menu>
      </HStack>
    </Grid>
  )
}

// The avatar stack and member count — one button that opens the Members sheet.
function MemberStack({ members, myUserId, onClick }) {
  return (
    <HStack as="button" type="button" onClick={onClick} spacing={2} maxW="100%"
      aria-label={`${pluralise(members.length, 'member')} — show members`}
      borderRadius="full" pr={2} ml={-0.5} layerStyle="hitArea" _hover={{ bg: 'bg.subtle' }}
      _focusVisible={{ boxShadow: 'outline' }} transition="background 0.1s">
      <AvatarStack members={members} myUserId={myUserId} />
      <Text as="span" fontSize="sm" color="text.muted" fontWeight="500" whiteSpace="nowrap">
        {pluralise(members.length, 'member')}
      </Text>
    </HStack>
  )
}
