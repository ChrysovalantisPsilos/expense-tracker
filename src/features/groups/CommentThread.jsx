import { useEffect, useState } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Stack, HStack, Text, Textarea, IconButton, Center, Spinner, Box,
} from '@chakra-ui/react'
import { Trash2, Send } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthProvider.jsx'
import { useAsyncSubmit } from '../../shared/lib/useAsyncSubmit.js'
import { useLiveRefetch } from '../../shared/lib/realtime.js'
import { shortDateTime } from '../../shared/lib/dates.js'
import UserAvatar from '../../shared/ui/UserAvatar.jsx'
import { listComments, addComment, deleteComment } from './comments.js'

// Thread of comments on one group item. Loads on open and stays live while
// open — new comments from other members appear as they're posted.
export default function CommentThread({ group, target, myMember, isOpen, onClose, onChanged }) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const { busy, run } = useAsyncSubmit()

  async function load(initial = false) {
    if (initial) setLoading(true) // live refetches swap in place, no spinner
    try { setComments(await listComments(group.id, target.id)) }
    catch { /* surfaced on send */ }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (isOpen && target) load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, target?.id])

  useLiveRefetch(
    isOpen && target ? `thread:${target.id}` : null,
    [{ table: 'group_comments', filter: `target_id=eq.${target?.id}` }],
    () => { load(); onChanged?.() },
  )

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || !myMember) return
    await run(async () => {
      await addComment({
        groupId: group.id, targetType: target.type, targetId: target.id,
        authorMemberId: myMember.id, body: body.trim(),
      })
      setBody('')
      await load()
      onChanged?.()
    })
  }

  async function remove(id) {
    await run(async () => {
      await deleteComment(id)
      await load()
      onChanged?.()
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>
          Comments
          {target?.label && (
            <Text fontSize="sm" fontWeight="400" color="text.muted" noOfLines={1}>{target.label}</Text>
          )}
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <Center py={8}><Spinner color="brand.500" /></Center>
          ) : comments.length === 0 ? (
            <Text color="text.muted" fontSize="sm" py={2}>No comments yet. Start the thread.</Text>
          ) : (
            <Stack spacing={3}>
              {comments.map((cm) => (
                <HStack key={cm.id} align="start" spacing={3}>
                  <UserAvatar size="xs" name={cm.author?.display_name} />
                  <Box flex="1" minW={0}>
                    <HStack spacing={2} mb={0.5}>
                      <Text fontSize="sm" fontWeight="600" noOfLines={1}>
                        {cm.author?.display_name || 'Member'}
                      </Text>
                      <Text fontSize="xs" color="text.muted">
                        {shortDateTime(cm.created_at)}
                      </Text>
                      <Box flex="1" />
                      {cm.author_id === user?.id && (
                        <IconButton aria-label="Delete comment" size="xs" variant="ghost" color="status.negative"
                          icon={<Trash2 size={13} />} isDisabled={busy} onClick={() => remove(cm.id)} />
                      )}
                    </HStack>
                    <Text fontSize="sm" whiteSpace="pre-wrap">{cm.body}</Text>
                  </Box>
                </HStack>
              ))}
            </Stack>
          )}
        </ModalBody>
        <ModalFooter>
          {myMember ? (
            <HStack as="form" onSubmit={send} w="full" align="end" spacing={2}>
              <Textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Write a comment…" resize="none"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e) }} />
              <IconButton type="submit" aria-label="Send" icon={<Send size={16} />}
                isLoading={busy} isDisabled={!body.trim()} />
            </HStack>
          ) : (
            <Text fontSize="sm" color="text.muted">Join the group to comment.</Text>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
