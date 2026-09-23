import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Avatar, Box, Flex, HStack, IconButton, Text, useToast,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react'
import { ArrowLeft, Plus, MoreVertical, LogOut, Trash2, Pencil, Camera, FileDown } from 'lucide-react'
import { uploadGroupImage } from './groups.js'
import { avatarStack, pluralise, sortMembers } from './groupFormat.js'
import PageHeader, { PageAction } from '../../shared/ui/PageHeader.jsx'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'

// The group page's title row: back, the group photo (owner can replace it),
// the name, a tappable member stack that opens the Members sheet, "Add
// expense", and the ⋯ menu. Menu actions are callbacks; `onLeave` is omitted
// when the viewer isn't a member.
export default function GroupHeader({
  group, members, myUserId, isOwner, onPhotoChanged,
  onAdd, onMembers, onReport, onRename, onLeave, onDelete,
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
    } catch (err) { toast({ title: 'Couldn’t update photo', description: err.message, status: 'error' }) }
    finally { setUploading(false) }
  }

  return (
    <PageHeader eyebrow="Group" title={group.name}
      meta={<MemberStack members={members} myUserId={myUserId} onClick={onMembers} />}
      leading={<>
        <IconButton aria-label="Back" variant="ghost" size="sm" ml={-2} flexShrink={0}
          icon={<ArrowLeft size={18} />} onClick={() => navigate('/groups')} />
        <Box position="relative" flexShrink={0}>
          <Avatar borderRadius="lg" size="md" name={group.name} src={group.image_url}
            bg="bg.subtle" color="accent.fg" />
          {isOwner && (
            <>
              <IconButton aria-label="Change group photo" icon={<Camera size={12} />}
                size="xs" borderRadius="full" position="absolute" bottom="-6px" right="-6px"
                isLoading={uploading} onClick={() => imgRef.current?.click()} />
              <input ref={imgRef} type="file" accept="image/*" hidden onChange={onGroupImage} />
            </>
          )}
        </Box>
      </>}
      action={<>
        <PageAction icon={<Plus size={16} />} label="Add expense" onClick={onAdd} />
        <Menu>
          <MenuButton as={IconButton} aria-label="Group options" size="sm" mr={-2}
            variant="ghost" icon={<MoreVertical size={18} />} />
          <MenuList>
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
      </>} />
  )
}

// Overlapping avatars (you and the owner first), a "+N" chip past four, and
// the member count — one button that opens the Members sheet.
function MemberStack({ members, myUserId, onClick }) {
  const { shown, overflow } = avatarStack(sortMembers(members, myUserId))
  const ring = { borderWidth: '2px', borderColor: 'bg.canvas' }
  return (
    <HStack as="button" type="button" onClick={onClick} spacing={2} maxW="100%"
      aria-label={`${pluralise(members.length, 'member')} — show members`}
      borderRadius="full" pr={2} ml={-0.5} _hover={{ bg: 'bg.subtle' }}
      _focusVisible={{ boxShadow: 'outline' }} transition="background 0.1s">
      <Flex as="span" flexShrink={0}>
        {shown.map((m, i) => (
          <UserAvatar key={m.id} size="xs" name={m.display_name} src={m.avatar_url}
            highlight={m.user_id === myUserId} {...ring} ml={i ? -2 : 0} zIndex={shown.length - i} />
        ))}
        {overflow > 0 && (
          <Flex as="span" boxSize="24px" {...ring} ml={-2} borderRadius="full" bg="bg.subtle"
            color="text.muted" fontSize="2xs" fontWeight="700" align="center" justify="center">
            +{overflow}
          </Flex>
        )}
      </Flex>
      <Text as="span" fontSize="sm" color="text.muted" fontWeight="500" noOfLines={1}>
        {pluralise(members.length, 'member')}
      </Text>
    </HStack>
  )
}
